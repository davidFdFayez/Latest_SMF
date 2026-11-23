using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The Website's Draw tab: a division's bracket, for anyone, but ONLY once
/// its draw is published (REQ-10 / REQ-11 rule 1). A Draft — or no draw at
/// all — answers 404 with the same body, so a visitor cannot even tell a
/// Draft exists. The tournament must be a public one, and the division must
/// belong to it.
/// </summary>
public static class PublicDrawEndpoints
{
    public static void MapPublicDrawEndpoints(this WebApplication app)
    {
        app.MapGet("/api/events/tournament-{id:int}/divisions/{divisionId:int}/draw", async (
            int id, int divisionId, SmfDbContext db, RegistrationAttachmentStore store, CancellationToken ct) =>
        {
            var isPublic = await EventsEndpoints.IsPublicTournamentAsync(db, id, ct);
            var division = isPublic
                ? await db.TournamentDivisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == divisionId && d.TournamentId == id, ct)
                : null;

            if (division?.DrawPublishedAt is null)
            {
                // An updated draw is a Draft under review: the website keeps showing the version that was published.
                var kept = division is null ? null : await db.DrawPublications.AsNoTracking()
                    .Where(p => p.DivisionId == division.Id && p.SupersededAt == null)
                    .OrderByDescending(p => p.Version).FirstOrDefaultAsync(ct);
                if (kept is not null)
                    return Results.Content(await PublicDraw.WithNationalityAsync(db, kept.SnapshotJson, kept.SlotsJson, ct), "application/json");

                return Results.Json(new
                {
                    code = "not_published",
                    messageAr = "لم تُنشر القرعة بعد",
                    messageEn = "The draw has not been published yet.",
                }, statusCode: StatusCodes.Status404NotFound);
            }

            return Results.Ok(await PublicDraw.ProjectAsync(db, division, store, ct));
        })
        .WithTags("Events");

        // Stage 5 Step 3 — the PUBLISHED bout schedule, read-only: exactly the snapshot frozen at publication
        // (days → rings → bouts with official numbers). Nothing unpublished, no draft, no admin data.
        app.MapGet("/api/events/tournament-{id:int}/schedule", async (int id, SmfDbContext db, ScheduleService schedule, CancellationToken ct) =>
        {
            var json = await EventsEndpoints.IsPublicTournamentAsync(db, id, ct) ? await schedule.PublicScheduleJsonAsync(id, ct) : null;
            if (json is null)
                return Results.Json(new
                {
                    code = "not_published",
                    messageAr = "لم يُنشر جدول المباريات بعد",
                    messageEn = "The match schedule has not been published yet.",
                }, statusCode: StatusCodes.Status404NotFound);
            return Results.Content(json, "application/json");
        })
        .WithTags("Events");

        // An athlete's photo in the PUBLISHED Match Schedule, by official bout number and corner — never by an id —
        // only while the published corner still names that athlete and PublicPhotos authorizes the photo now.
        // Everything else answers the same plain 404 (same headers as the bracket's photo route).
        app.MapGet("/api/events/tournament-{id:int}/schedule/photo/{number:int}/{corner}", async (
            int id, int number, string corner, HttpContext http, SmfDbContext db, ScheduleService schedule, CancellationToken ct) =>
        {
            var photo = await EventsEndpoints.IsPublicTournamentAsync(db, id, ct) ? await schedule.PublicPhotoAsync(id, number, corner, ct) : null;
            if (photo is null) return Results.NotFound();
            http.Response.Headers.CacheControl = "public, max-age=3600";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(photo.Value.Path, photo.Value.ContentType);
        })
        .WithTags("Events");

        // An athlete's photo in a PUBLISHED draw, by bracket slot — never by an id — and only when the athlete
        // authorized public display (PublicPhotos). Everything else answers the same plain 404.
        app.MapGet("/api/events/tournament-{id:int}/divisions/{divisionId:int}/draw/photo/{round:int}/{position:int}/{corner}", async (
            int id, int divisionId, int round, int position, string corner, HttpContext http,
            SmfDbContext db, RegistrationAttachmentStore store, CancellationToken ct) =>
        {
            var isPublic = await EventsEndpoints.IsPublicTournamentAsync(db, id, ct);
            var published = isPublic
                && await db.TournamentDivisions.AsNoTracking().AnyAsync(d => d.Id == divisionId && d.TournamentId == id && d.DrawPublishedAt != null, ct);
            (string Path, string ContentType)? photo = null;
            if (published)
                photo = await PublicDraw.SlotPhotoAsync(db, store, divisionId, round, position, corner, ct);
            else if (isPublic && corner is "red" or "blue")
            {
                // While an updated draw is a Draft, the slots are those of the version still on the website.
                var kept = await db.DrawPublications.AsNoTracking()
                    .Where(p => p.DivisionId == divisionId && p.TournamentId == id && p.SupersededAt == null)
                    .OrderByDescending(p => p.Version).FirstOrDefaultAsync(ct);
                if (kept is not null
                    && System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, int>>(kept.SlotsJson) is { } slots
                    && slots.TryGetValue($"{round}:{position}:{corner}", out var entryId))
                    photo = await PublicDraw.EntryPhotoAsync(db, store, entryId, ct);
            }
            if (photo is null) return Results.NotFound();
            http.Response.Headers.CacheControl = "public, max-age=3600";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(photo.Value.Path, photo.Value.ContentType);
        })
        .WithTags("Events");
    }
}
