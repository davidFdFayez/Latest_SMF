using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

public static class AuthEndpoints
{
    /// <summary>How long a reset link stays usable, unless configured otherwise.</summary>
    private const int DefaultResetExpiryMinutes = 60;

    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth").WithTags("Auth");

        group.MapPost("/login", async (LoginRequest request, SmfDbContext db, JwtTokenService jwt, IConfiguration config) =>
        {
            var user = await db.AdminUsers.FirstOrDefaultAsync(u => u.Username == request.Username);
            if (user is null || !PasswordHasher.VerifyPassword(request.Password, user.PasswordHash, user.PasswordSalt))
            {
                return Results.Unauthorized();
            }

            // A deactivated account kept working because IsActive was stored but
            // never consulted, so revoking access had no effect. Checked after
            // the password so a wrong password and a disabled account are
            // indistinguishable to the caller.
            if (!user.IsActive) return Results.Unauthorized();

            var access = await AdminIdentity.LoadAsync(db, user.Id);
            if (access is null) return Results.Unauthorized();

            var token = jwt.GenerateToken(user);
            var expiryMinutes = int.Parse(config["Jwt:ExpiryMinutes"] ?? "480");
            var profile = Profile(access);

            return Results.Ok(new LoginResponse(
                token,
                DateTime.UtcNow.AddMinutes(expiryMinutes),
                profile.Id,
                profile.Username,
                profile.DisplayName,
                profile.Roles,
                profile.Permissions,
                profile.MembershipGrants));
        });

        // The console refreshes the session from here, so a role change made by
        // another administrator shows up without signing out and back in.
        group.MapGet("/me", async (ClaimsPrincipal principal, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            if (AdminIdentity.Current(principal).Id is not int id) return Results.Unauthorized();

            var access = await AdminIdentity.LoadAsync(db, id, cancellationToken);
            return access is null ? Results.Unauthorized() : Results.Ok(Profile(access));
        }).RequireAuthorization();

        MapPasswordReset(group);
    }

    /// <summary>
    /// Self-service password reset.
    ///
    /// Both endpoints answer identically whether or not the account exists, so
    /// neither can be used to discover which usernames or addresses are real.
    /// The link carries a single-use token that expires, only its hash is
    /// stored, requesting a new one voids the last, and completing a reset
    /// signs out every existing session for that account.
    /// </summary>
    private static void MapPasswordReset(RouteGroupBuilder group)
    {
        group.MapPost("/forgot-password", async (
            ForgotPasswordRequest request,
            SmfDbContext db,
            EmailSender email,
            AuditLogger audit,
            IConfiguration config,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken) =>
        {
            var logger = loggerFactory.CreateLogger("Smf.Api.PasswordReset");

            // Deliberately the same answer in every branch below.
            var accepted = Results.Ok(new
            {
                message = "إذا كان الحساب موجوداً فسيصلك رابط إعادة التعيين. / If the account exists, a reset link has been sent.",
                messageAr = "إذا كان الحساب موجوداً وله بريد مسجل، فسيصلك رابط إعادة تعيين كلمة المرور.",
                messageEn = "If that account exists and has an email address on file, a reset link is on its way.",
            });

            var account = request.Account?.Trim().ToLowerInvariant() ?? string.Empty;
            if (account.Length == 0) return accepted;

            var user = await db.AdminUsers.FirstOrDefaultAsync(
                u => u.Username.ToLower() == account || (u.Email != null && u.Email.ToLower() == account),
                cancellationToken);

            if (user is null || !user.IsActive || string.IsNullOrWhiteSpace(user.Email))
            {
                logger.LogInformation(
                    "Password reset requested for an account that cannot receive one ({Known}).",
                    user is null ? "no such account" : !user.IsActive ? "deactivated" : "no email address");
                return accepted;
            }

            var now = DateTime.UtcNow;

            // One live link at a time: asking again voids the previous one.
            var outstanding = await db.PasswordResetTokens
                .Where(t => t.AdminUserId == user.Id && t.UsedAt == null)
                .ToListAsync(cancellationToken);
            foreach (var token in outstanding) token.UsedAt = now;

            var raw = Services.PasswordResetTokens.Create();
            db.PasswordResetTokens.Add(new PasswordResetToken
            {
                AdminUserId = user.Id,
                TokenHash = Services.PasswordResetTokens.Hash(raw),
                CreatedAt = now,
                ExpiresAt = now.AddMinutes(ExpiryMinutes(config)),
            });

            audit.Write(SelfService(user), AuditActions.PasswordResetRequested, "admin_user", user.Id, user.Username);
            await db.SaveChangesAsync(cancellationToken);

            var link = $"{ConsoleBaseUrl(config)}/reset-password?token={Uri.EscapeDataString(raw)}";
            var minutes = ExpiryMinutes(config);

            await email.SendAsync(
                user.Email,
                "إعادة تعيين كلمة المرور — لوحة تحكم الاتحاد / Password reset — SMF admin",
                $"""
                 مرحباً {user.DisplayName}،

                 وردنا طلب لإعادة تعيين كلمة مرور حسابك ({user.Username}) في لوحة تحكم الاتحاد السعودي للملاكمة التايلندية.

                 لتعيين كلمة مرور جديدة، افتح الرابط التالي خلال {minutes} دقيقة:
                 {link}

                 إذا لم تطلب ذلك، تجاهل هذه الرسالة؛ لن تتغير كلمة المرور.

                 ——

                 Hello {user.DisplayName},

                 We received a request to reset the password for your account ({user.Username}) on the Saudi Muaythai Federation admin console.

                 To choose a new password, open this link within {minutes} minutes:
                 {link}

                 If you did not request this, ignore this message — your password will not change.
                 """,
                cancellationToken);

            return accepted;
        })
        .RequireRateLimiting(RateLimitPolicies.PasswordReset);

        // Lets the reset screen say "this link has expired" before the user
        // types a new password into a form that cannot work.
        group.MapGet("/reset-password/{token}", async (string token, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var entry = await FindUsableAsync(db, token, cancellationToken);
            return Results.Ok(new { valid = entry is not null });
        })
        .RequireRateLimiting(RateLimitPolicies.PasswordReset);

        group.MapPost("/reset-password", async (
            ResetPasswordRequest request,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            if (!PasswordPolicy.IsAcceptable(request.Password))
                return Results.Json(new
                {
                    message = $"{PasswordPolicy.MessageAr} / {PasswordPolicy.MessageEn}",
                    messageAr = PasswordPolicy.MessageAr,
                    messageEn = PasswordPolicy.MessageEn,
                }, statusCode: StatusCodes.Status400BadRequest);

            var entry = await FindUsableAsync(db, request.Token, cancellationToken);
            if (entry?.User is null || !entry.User.IsActive)
                return Results.Json(new
                {
                    message = "رابط إعادة التعيين غير صالح أو منتهي. / This reset link is invalid or has expired.",
                    messageAr = "رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.",
                    messageEn = "This reset link is invalid or has expired. Please request a new one.",
                }, statusCode: StatusCodes.Status400BadRequest);

            var user = entry.User;
            (user.PasswordHash, user.PasswordSalt) = PasswordHasher.HashPassword(request.Password!);

            // Every session signed in with the old password stops working.
            user.SecurityStamp = Guid.NewGuid().ToString("N");
            entry.UsedAt = DateTime.UtcNow;

            audit.Write(SelfService(user), AuditActions.PasswordResetCompleted, "admin_user", user.Id, user.Username);
            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new
            {
                message = "تم تعيين كلمة المرور. / Your password has been set.",
                messageAr = "تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن.",
                messageEn = "Your new password is set. You can sign in now.",
                username = user.Username,
            });
        })
        .RequireRateLimiting(RateLimitPolicies.PasswordReset);
    }

    private static async Task<PasswordResetToken?> FindUsableAsync(SmfDbContext db, string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        var hash = Services.PasswordResetTokens.Hash(token);
        var entry = await db.PasswordResetTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash, cancellationToken);

        return entry is not null && entry.IsUsable(DateTime.UtcNow) ? entry : null;
    }

    /// <summary>The audit trail names the account itself as the actor; nobody is signed in.</summary>
    private static AdminIdentity.Actor SelfService(AdminUser user) =>
        new(user.Id, user.Username, "self-service", new HashSet<string>());

    private static int ExpiryMinutes(IConfiguration config) =>
        int.TryParse(config["Admin:PasswordResetExpiryMinutes"], out var minutes) && minutes is > 0 and <= 1440
            ? minutes
            : DefaultResetExpiryMinutes;

    /// <summary>Where the console lives, so the emailed link points at it.</summary>
    private static string ConsoleBaseUrl(IConfiguration config) =>
        (config["Admin:BaseUrl"] ?? "http://localhost:5174").TrimEnd('/');

    public static AdminProfile Profile(AdminIdentity.Access access)
    {
        var actor = new AdminIdentity.Actor(access.User.Id, access.User.Username, null, access.Permissions);

        return new AdminProfile(
            access.User.Id,
            access.User.Username,
            access.User.DisplayName,
            access.Roles.Select(r => new RoleSummary(r.Id, r.Key, r.NameAr, r.NameEn)).ToList(),
            access.Permissions.Order().ToArray(),
            actor.Grants);
    }
}
