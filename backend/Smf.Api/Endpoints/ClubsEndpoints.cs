using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// Public directory of clubs, centres, and academies — the destination for the
/// "Try Muaythai" call to action, so a visitor can find somewhere near them to
/// train.
///
/// Two deliberate constraints:
///
///   • Only registrations the federation has actually <c>approved</c> are
///     listed. A pending or rejected application must never appear as though it
///     were an endorsed facility.
///
///   • Only club-level business details are projected out. The registration
///     payload also holds the owner's and head coach's names, ID numbers, and
///     personal mobiles; the declaration the applicant accepted covers
///     registration, review, governance, and contact about the request — it does
///     not authorise publishing personal contact details on a public page. See
///     <see cref="PublicFields"/>.
/// </summary>
public static class ClubsEndpoints
{
    /// <summary>
    /// Payload keys safe to publish. Anything not listed here — owner name and
    /// ID, applicant details, head coach name and mobile, national address,
    /// attachments — stays private to the admin dashboard.
    /// </summary>
    private static readonly string[] PublicFields =
    [
        "nameAr", "nameEn", "entityType",
        "region", "city", "district",
        "shortAddress", "googleMapsUrl",
        "officialEmail", "clubWebsite", "clubSocialMedia",
        "categoriesAccepted", "trainingSchedule",
    ];

    public static void MapClubsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/clubs", async (string? region, string? search, SmfDbContext db) =>
        {
            var approved = await db.Registrations
                .AsNoTracking()
                .Where(r => r.Type == "club" && r.Status == RegistrationStatuses.Approved)
                .OrderBy(r => r.ApprovedAt ?? r.CreatedAt)
                .ToListAsync();

            var clubs = approved
                .Select(Project)
                .Where(c => c is not null)
                .Select(c => c!)
                .ToList();

            if (!string.IsNullOrWhiteSpace(region))
                clubs = clubs.Where(c => string.Equals(c.Region, region, StringComparison.OrdinalIgnoreCase)).ToList();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                clubs = clubs
                    .Where(c =>
                        Contains(c.NameAr, term) ||
                        Contains(c.NameEn, term) ||
                        Contains(c.City, term) ||
                        Contains(c.Region, term))
                    .ToList();
            }

            return Results.Ok(clubs);
        }).WithTags("Clubs");

        // Regions that actually have an approved club, so the filter never
        // offers an option that returns nothing.
        app.MapGet("/api/clubs/regions", async (SmfDbContext db) =>
        {
            var approved = await db.Registrations
                .AsNoTracking()
                .Where(r => r.Type == "club" && r.Status == RegistrationStatuses.Approved)
                .ToListAsync();

            var regions = approved
                .Select(Project)
                .Where(c => c is not null && !string.IsNullOrWhiteSpace(c.Region))
                .Select(c => c!.Region!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(r => r, StringComparer.Ordinal)
                .ToList();

            return Results.Ok(regions);
        }).WithTags("Clubs");
    }

    private static bool Contains(string? value, string term) =>
        !string.IsNullOrEmpty(value) && value.Contains(term, StringComparison.OrdinalIgnoreCase);

    private static ClubListing? Project(Data.Models.Registration registration)
    {
        JsonElement payload;
        try
        {
            using var document = JsonDocument.Parse(registration.PayloadJson);
            payload = document.RootElement.Clone();
        }
        catch (JsonException)
        {
            return null;
        }

        if (payload.ValueKind != JsonValueKind.Object) return null;

        string? Read(string name) =>
            PublicFields.Contains(name) ? RegistrationPayload.FirstString(payload, name) : null;

        var nameAr = Read("nameAr");
        var nameEn = Read("nameEn");

        // A listing with no name is not usable on the page.
        if (string.IsNullOrWhiteSpace(nameAr) && string.IsNullOrWhiteSpace(nameEn)) return null;

        return new ClubListing(
            registration.Id,
            nameAr,
            nameEn,
            Read("entityType"),
            Read("region"),
            Read("city"),
            Read("district"),
            Read("shortAddress"),
            Read("googleMapsUrl"),
            Read("officialEmail"),
            Read("clubWebsite"),
            Read("clubSocialMedia"),
            Read("categoriesAccepted"),
            Read("trainingSchedule"),
            registration.MembershipNumber,
            registration.ApprovedAt);
    }

    public record ClubListing(
        int Id,
        string? NameAr,
        string? NameEn,
        string? EntityType,
        string? Region,
        string? City,
        string? District,
        string? ShortAddress,
        string? GoogleMapsUrl,
        string? Email,
        string? Website,
        string? SocialMedia,
        string? CategoriesAccepted,
        string? TrainingSchedule,
        string? MembershipNumber,
        DateTime? ApprovedAt);
}
