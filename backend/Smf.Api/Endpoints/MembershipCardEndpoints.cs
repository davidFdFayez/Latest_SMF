using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The public face of a membership card (ISSUE-03).
///
/// Everything here is reachable without signing in, because the whole point is
/// that an official on a competition door can scan a code and see an answer.
/// Three things make that safe: the token is 32 random bytes, the response
/// carries no contact details or identity numbers, and the routes are rate
/// limited so the space cannot be swept.
/// </summary>
public static class MembershipCardEndpoints
{
    public static void MapMembershipCardEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/membership-card")
            .WithTags("Membership card")
            .RequireRateLimiting(RateLimitPolicies.MembershipCard);

        group.MapGet("/{token}", async (
            string token,
            SmfDbContext db,
            IConfiguration configuration,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            var registration = await Find(db, token, cancellationToken);
            if (registration is null) return Results.NotFound();

            NoIndex(http);
            return Results.Ok(MembershipCards.Describe(registration, DateTime.UtcNow, configuration));
        });

        // The card's picture, served through the token rather than the admin
        // attachment route, so a card never needs a signed-in session and the
        // protected route stays protected.
        group.MapGet("/{token}/photo", async (
            string token,
            SmfDbContext db,
            RegistrationAttachmentStore store,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            var registration = await Find(db, token, cancellationToken);
            if (registration is null) return Results.NotFound();

            var photoId = MembershipCards.PhotoId(registration);
            if (photoId is null || !store.TryResolve(photoId, out var path, out var meta))
                return Results.NotFound();

            // A photo is personal even on a card, so it is never cached by a
            // shared proxy, only by the browser that asked for it.
            http.Response.Headers.CacheControl = "private, max-age=3600";
            NoIndex(http);

            return Results.File(path, meta.ContentType);
        });

        group.MapGet("/{token}/qr.svg", async (
            string token,
            SmfDbContext db,
            IConfiguration configuration,
            HttpContext http,
            CancellationToken cancellationToken) =>
        {
            var registration = await Find(db, token, cancellationToken);
            if (registration is null) return Results.NotFound();

            var svg = QrCode.ToSvg(MembershipCards.Url(token, configuration), pixels: 480);

            http.Response.Headers.CacheControl = "private, max-age=86400";
            NoIndex(http);

            // The API's default policy is "default-src 'none'", which stops a
            // browser rendering an SVG opened in its own tab. This one draws
            // nothing but its own rectangles.
            http.Response.Headers.Remove("Content-Security-Policy");

            return Results.Content(svg, "image/svg+xml");
        });
    }

    /// <summary>
    /// The membership a token belongs to, or null.
    ///
    /// A token that exists but belongs to a membership which was never approved
    /// is treated as no card at all, so revoking by regenerating is total.
    /// </summary>
    private static async Task<Data.Models.Registration?> Find(
        SmfDbContext db,
        string token,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length is < 20 or > 100) return null;

        var registration = await db.Registrations
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.CardToken == token, cancellationToken);

        return registration is not null && MembershipCards.IsEligible(registration) ? registration : null;
    }

    /// <summary>A card is for the person holding it, not for a search index.</summary>
    private static void NoIndex(HttpContext http) =>
        http.Response.Headers["X-Robots-Tag"] = "noindex, nofollow, noarchive";
}
