using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Endpoints;

public static class EventsEndpoints
{
    /// <summary>
    /// The id a tournament carries in the Activities feed. Prefixed so it can
    /// never collide with an event's id, and so a card's existing details link
    /// (/activities/event/{id}) resolves back to the tournament.
    /// </summary>
    private const string TournamentIdPrefix = "tournament-";

    /// <summary>
    /// The tournament statuses the public sees: from publication on. A draft
    /// was never published, and a cancelled tournament is not taking place,
    /// so neither is shown.
    /// </summary>
    private static readonly string[] PublicTournamentStatuses =
    [
        TournamentStatuses.Published,
        TournamentStatuses.Closed,
        TournamentStatuses.Running,
        TournamentStatuses.Completed,
    ];

    public static void MapEventsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/events").WithTags("Events");

        /// Activities: the federation's events, and every published tournament
        /// under the category its organiser chose to show it in.
        group.MapGet("/", async (string? lang, string? category, SmfDbContext db) =>
        {
            var query = db.Events.AsNoTracking().Where(e => e.IsPublished);
            var tournaments = PublicTournaments(db);

            if (!string.IsNullOrWhiteSpace(category))
            {
                query = query.Where(e => e.Category == category);
                tournaments = tournaments.Where(t => t.ActivityCategory == category);
            }

            var items = (await query.ToListAsync())
                .Select(e => (e.StartDate, Item: Project(e, lang)))
                .Concat((await tournaments.ToListAsync()).Select(t => (t.StartDate, Item: Project(t, lang))))
                .OrderBy(entry => entry.StartDate)
                .Select(entry => entry.Item);

            return Results.Ok(items);
        });

        group.MapGet("/{id:int}", async (int id, string? lang, SmfDbContext db) =>
        {
            var item = await db.Events.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == id && e.IsPublished);
            return item is null ? Results.NotFound() : Results.Ok(Project(item, lang));
        });

        /// A published tournament's details page. The card fields come first,
        /// as for any activity; <c>tournament</c> carries what only a
        /// tournament has, and is what tells the site to use its layout.
        group.MapGet("/" + TournamentIdPrefix + "{id:int}", async (int id, string? lang, SmfDbContext db) =>
        {
            var tournament = await PublicTournaments(db).FirstOrDefaultAsync(t => t.Id == id);
            if (tournament is null) return Results.NotFound();

            var lookups = await db.TournamentLookups.AsNoTracking()
                .Where(l => (l.Kind == LookupKinds.TournamentType && l.Value == tournament.Type)
                    || (l.Kind == LookupKinds.CompetitionType && l.Value == tournament.CompetitionType))
                .ToListAsync();
            var type = lookups.FirstOrDefault(l => l.Kind == LookupKinds.TournamentType);
            var competition = lookups.FirstOrDefault(l => l.Kind == LookupKinds.CompetitionType);
            var category = ActivityCategories.All.FirstOrDefault(c => c.Value == tournament.ActivityCategory);

            var categoryOrder = CompetitionCategories.All.Select(c => c.Value).ToList();
            // Divisions whose published version stays on the website while an updated draw is a Draft.
            var keptPublished = (await db.DrawPublications.AsNoTracking()
                    .Where(p => p.TournamentId == id && p.SupersededAt == null).Select(p => p.DivisionId).ToListAsync())
                .ToHashSet();
            var divisions = (await db.TournamentDivisions.AsNoTracking()
                    .Where(d => d.TournamentId == id)
                    .ToListAsync())
                // Female first, then Male; youngest category to oldest; lightest
                // class to heaviest, the open "+" class last.
                .OrderBy(d => d.Gender == "female" ? 0 : 1)
                .ThenBy(d => categoryOrder.IndexOf(d.Category) is var i and >= 0 ? i : int.MaxValue)
                .ThenBy(d => d.SortWeight)
                .Select(d =>
                {
                    var (categoryAr, categoryEn) = CompetitionCategories.Label(d.Category);
                    return new
                    {
                        // The Draw tab opens a division by id, and shows its bracket only when published.
                        id = d.Id,
                        drawPublished = d.DrawPublishedAt != null || keptPublished.Contains(d.Id),
                        genderAr = d.Gender == "female" ? "إناث" : "ذكور",
                        genderEn = d.Gender == "female" ? "Female" : "Male",
                        categoryAr,
                        categoryEn,
                        weightAr = d.WeightLabel(arabic: true),
                        weightEn = d.WeightLabel(arabic: false),
                    };
                });

            return Results.Ok(new
            {
                activity = Project(tournament, lang),
                tournament = new
                {
                    categoryAr = category.Ar,
                    categoryEn = category.En,
                    registrationOpen = tournament.IsRegistrationOpen(DateTime.UtcNow),
                    // The page's key dates. Registration opens when the
                    // tournament is published (IsRegistrationOpen) and closes
                    // at its closing date; nothing else is dated on a tournament.
                    registrationOpensAt = tournament.PublishedAt,
                    registrationClosesAt = tournament.RegistrationClosesAt,
                    onSiteCheckInStartsAt = tournament.OnSiteCheckInStartsAt,
                    onSiteCheckInEndsAt = tournament.OnSiteCheckInEndsAt,
                    typeAr = type?.NameAr,
                    typeEn = type?.NameEn,
                    competitionTypeAr = competition?.NameAr,
                    competitionTypeEn = competition?.NameEn,
                    firstBoutTime = tournament.FirstBoutTime.ToString(@"hh\:mm"),
                    // Terms & Conditions in both languages (already cleaned when
                    // saved); the page shows its own language, else the other.
                    termsAr = tournament.TermsAr,
                    termsEn = tournament.TermsEn,
                    divisions,
                },
            });
        });
    }

    private static IQueryable<Tournament> PublicTournaments(SmfDbContext db) =>
        db.Tournaments.AsNoTracking().Where(t => PublicTournamentStatuses.Contains(t.Status));

    /// <summary>Whether a tournament is one the public site shows (the same rule as its details page).</summary>
    internal static Task<bool> IsPublicTournamentAsync(SmfDbContext db, int id, CancellationToken cancellationToken) =>
        PublicTournaments(db).AnyAsync(t => t.Id == id, cancellationToken);

    /// <summary>
    /// A tournament's public status, in the events' vocabulary — never its
    /// internal one.
    /// </summary>
    private static string PublicStatus(Tournament t) => t.Status switch
    {
        TournamentStatuses.Completed => "completed",
        TournamentStatuses.Running => "ongoing",
        _ => "confirmed",
    };

    private static object Project(EventItem e, string? lang) => lang switch
    {
        "ar" => new
        {
            e.Id,
            title = e.TitleAr,
            description = e.DescriptionAr,
            e.Category,
            e.StartDate,
            e.EndDate,
            location = e.LocationAr,
            e.ImageUrl,
            e.Status
        },
        "en" => new
        {
            e.Id,
            title = e.TitleEn,
            description = e.DescriptionEn,
            e.Category,
            e.StartDate,
            e.EndDate,
            location = e.LocationEn,
            e.ImageUrl,
            e.Status
        },
        _ => new
        {
            e.Id,
            e.TitleAr,
            e.TitleEn,
            e.DescriptionAr,
            e.DescriptionEn,
            e.Category,
            e.StartDate,
            e.EndDate,
            e.LocationAr,
            e.LocationEn,
            e.ImageUrl,
            e.Status
        }
    };

    /// <summary>
    /// A published tournament in the same shape as an event, so the site's
    /// existing cards, filters and details page take it as they are. Only the
    /// public facts go out: no entries, divisions or internal status.
    /// </summary>
    private static object Project(Tournament t, string? lang)
    {
        var id = TournamentIdPrefix + t.Id;
        var status = PublicStatus(t);

        return lang switch
        {
            "ar" => new
            {
                id,
                title = t.NameAr,
                description = t.DescriptionAr,
                category = t.ActivityCategory,
                startDate = t.StartDate,
                endDate = t.EndDate,
                location = t.LocationAr,
                imageUrl = t.BannerImageUrl,
                imageCrop = BannerCrop.Parse(t.BannerImageCrop),
                status,
            },
            "en" => new
            {
                id,
                title = t.NameEn,
                description = t.DescriptionEn,
                category = t.ActivityCategory,
                startDate = t.StartDate,
                endDate = t.EndDate,
                location = t.LocationEn,
                imageUrl = t.BannerImageUrl,
                imageCrop = BannerCrop.Parse(t.BannerImageCrop),
                status,
            },
            _ => (object)new
            {
                id,
                titleAr = t.NameAr,
                titleEn = t.NameEn,
                descriptionAr = t.DescriptionAr,
                descriptionEn = t.DescriptionEn,
                category = t.ActivityCategory,
                startDate = t.StartDate,
                endDate = t.EndDate,
                locationAr = t.LocationAr,
                locationEn = t.LocationEn,
                imageUrl = t.BannerImageUrl,
                imageCrop = BannerCrop.Parse(t.BannerImageCrop),
                status,
            },
        };
    }
}
