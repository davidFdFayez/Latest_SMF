using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

public static class AuthEndpoints
{
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

            var token = jwt.GenerateToken(user);
            var expiryMinutes = int.Parse(config["Jwt:ExpiryMinutes"] ?? "480");

            return Results.Ok(new LoginResponse(token, DateTime.UtcNow.AddMinutes(expiryMinutes), user.Username, user.DisplayName));
        });
    }
}
