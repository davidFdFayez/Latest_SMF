using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Smf.Api.Data;
using Smf.Api.Endpoints;
using Smf.Api.Services;

var builder = WebApplication.CreateBuilder(args);

const string CorsPolicy = "SmfCors";

// SEC-06 — Kestrel stops advertising itself in every response.
builder.WebHost.ConfigureKestrel(options => options.AddServerHeader = false);

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

builder.Services.AddDbContext<SmfDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("DefaultConnection") ?? "Data Source=smf.db"));

builder.Services.AddScoped<JwtTokenService>();

// Registration documents live on disk next to smf.db (see the class for why).
builder.Services.AddSingleton<RegistrationAttachmentStore>();

// Registration lifecycle notifications (REG-06).
builder.Services.AddSingleton<EmailSender>();
builder.Services.AddSingleton<SmsSender>();

// Phase 2 membership lifecycle (§1–§6). Scoped: both share the request's
// DbContext so a decision and its audit entry commit together.
builder.Services.AddScoped<AuditLogger>();
builder.Services.AddScoped<MembershipService>();

// SEC-05 — behind Cloudflare the origin only ever sees the edge's address, so
// the real client IP (used by the rate limiter and the logs) comes from the
// forwarded headers. KnownNetworks/Proxies are cleared because the upstream is
// the container network, not a fixed address.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "https://smf.187-124-4-73.sslip.io",
                "http://smf.187-124-4-73.sslip.io",
                "https://admin.187-124-4-73.sslip.io",
                "http://admin.187-124-4-73.sslip.io"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var jwtSection = builder.Configuration.GetSection("Jwt");
var jwtSecret = jwtSection["Secret"] ?? throw new InvalidOperationException("Jwt:Secret is not configured.");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSection["Issuer"],
        ValidAudience = jwtSection["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ClockSkew = TimeSpan.FromMinutes(1)
    };
});

builder.Services.AddAuthorization();

// The registration submit and document-upload endpoints are public writes, so
// they are capped per client address. The window is far above what a genuine
// applicant needs (a club submits at most a handful of documents) and well
// below what it takes to fill the disk.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy(RateLimitPolicies.PublicRegistration, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(10),
            }));
});

var app = builder.Build();

app.UseForwardedHeaders();

// SEC-02 — anything that escapes an endpoint is answered as JSON. A malformed
// request body surfaces as BadHttpRequestException and must be a 400; only a
// genuine server fault is allowed to be a 500, and it never leaks a stack trace.
app.UseExceptionHandler(errorApp => errorApp.Run(async context =>
{
    var feature = context.Features.Get<IExceptionHandlerFeature>();
    var badRequest = feature?.Error is BadHttpRequestException;

    context.Response.StatusCode = badRequest
        ? StatusCodes.Status400BadRequest
        : StatusCodes.Status500InternalServerError;
    context.Response.ContentType = "application/problem+json";

    await context.Response.WriteAsJsonAsync(badRequest
        ? new
        {
            message = "الطلب غير صالح. / The request could not be read.",
            messageAr = "الطلب غير صالح أو ناقص.",
            messageEn = "The request body could not be read or is missing.",
        }
        : new
        {
            message = "حدث خطأ غير متوقع. / An unexpected error occurred.",
            messageAr = "حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.",
            messageEn = "An unexpected error occurred. Please try again later.",
        });
}));

// SEC-03/SEC-06 — the API answers with the same protective headers as the site,
// and never advertises the server product or version.
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
    headers["X-Frame-Options"] = "DENY";
    headers["X-Content-Type-Options"] = "nosniff";
    headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), interest-cohort=()";
    headers["Cross-Origin-Resource-Policy"] = "same-site";
    if (context.Request.IsHttps || context.Request.Headers["X-Forwarded-Proto"] == "https")
        headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload";

    headers.Remove("Server");
    headers.Remove("X-Powered-By");

    await next();
});

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors(CorsPolicy);
app.UseDefaultFiles();
app.UseStaticFiles();

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

// SEC-04 — the API host is not a place for crawlers.
app.MapGet("/robots.txt", () => Results.Text(
    "User-agent: *\nDisallow: /\n", "text/plain; charset=utf-8"))
    .ExcludeFromDescription();

// Public + admin minimal API endpoint groups.
app.MapAuthEndpoints();
app.MapPagesEndpoints();
app.MapNewsEndpoints();
app.MapEventsEndpoints();
app.MapResultsEndpoints();
app.MapSettingsEndpoints();
app.MapRegistrationsEndpoints();
app.MapClubsEndpoints();
app.MapContactEndpoints();
app.MapWhistleblowerEndpoints();
app.MapAdminEndpoints();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<SmfDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("Smf.Api.Startup");
    SeedData.Initialize(db, app.Environment, logger, app.Configuration);
}

app.Run();
