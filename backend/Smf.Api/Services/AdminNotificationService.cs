using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Endpoints;

namespace Smf.Api.Services;

/// <summary>
/// Creates and resolves Admin Notification Center notices. Informational only: it reads the existing
/// change detection (<see cref="ScheduleService.ChangesSincePublicationAsync"/> — the same data behind Bout
/// Schedule's Update Required warnings) and writes nothing but notifications. A failure here never undoes or
/// blocks the action that triggered it.
/// </summary>
public class AdminNotificationService(SmfDbContext db, ScheduleService schedule, DrawService draws, ILogger<AdminNotificationService> logger)
{
    /// <summary>
    /// After an updated draw is published: if the change affects the tournament's published bout schedule, one
    /// open "Bout Schedule Update Required" notice exists for the tournament, naming every division whose draw
    /// changed. The same change twice is not a second notice; a further affected division updates the open one.
    /// </summary>
    public async Task DrawPublishedAsync(int tournamentId, CancellationToken ct = default)
    {
        try
        {
            var changes = await schedule.ChangesSincePublicationAsync(tournamentId, draws, ct);
            var changed = changes.Divisions.Where(d => d.DrawRepublished).ToList();
            if (changes.Version is null || !changes.UpdateRequired || changed.Count == 0) return; // no schedule, or not affected

            var ids = changes.Divisions.Select(d => d.DivisionId).ToList();
            var divisions = await db.TournamentDivisions.AsNoTracking().Where(d => ids.Contains(d.Id)).ToDictionaryAsync(d => d.Id, ct);
            string Name(int id) => TournamentParticipantsEndpoints.DivisionHeading(divisions.GetValueOrDefault(id));
            var versions = await db.DrawPublications.AsNoTracking()
                .Where(p => p.TournamentId == tournamentId && p.SupersededAt == null).ToListAsync(ct);
            // The change itself: which divisions' draws changed, at which published version.
            var key = string.Join(",", changed.OrderBy(d => d.DivisionId).Select(d =>
                $"{d.DivisionId}:v{versions.FirstOrDefault(v => v.DivisionId == d.DivisionId)?.Version}"));

            var names = changed.Select(d => Name(d.DivisionId)).ToList();
            var others = changes.Divisions.Where(d => !d.DrawRepublished).Select(d => Name(d.DivisionId)).ToList();
            var message = (names.Count == 1
                    ? $"The draw for {names[0]} has changed."
                    : $"The draws for {Join(names)} have changed.")
                + " The bout schedule needs to be updated."
                + (others.Count > 0 ? $" Bout times are also affected in {Join(others)}." : "");
            var link = $"/bout-schedule?tournament={tournamentId}&highlight={string.Join(",", ids)}";

            var open = await db.AdminNotifications.FirstOrDefaultAsync(n => n.Type == AdminNotificationTypes.ScheduleUpdateRequired
                && n.TournamentId == tournamentId && n.ResolvedAt == null, ct);
            if (open is not null && open.DedupeKey == key) return; // the same change: no duplicate
            var now = DateTime.UtcNow;
            if (open is null)
            {
                db.AdminNotifications.Add(new AdminNotification
                {
                    Type = AdminNotificationTypes.ScheduleUpdateRequired, TournamentId = tournamentId,
                    Title = "Bout Schedule Update Required", Message = message, Link = link,
                    Permissions = string.Join(",", BoutScheduleEndpoints.Readers), DedupeKey = key,
                    CreatedAt = now, UpdatedAt = now,
                });
            }
            else
            {
                // Another draw change while one is still open: one notice, updated, and unread again for everyone.
                open.Message = message;
                open.Link = link;
                open.DedupeKey = key;
                open.UpdatedAt = now;
                await db.AdminNotificationReads.Where(r => r.NotificationId == open.Id).ExecuteDeleteAsync(ct);
            }
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not create the Bout Schedule notification for tournament {TournamentId}.", tournamentId);
        }
    }

    /// <summary>After a bout schedule is published: an open notice is resolved once no update is required any more.</summary>
    public async Task SchedulePublishedAsync(int tournamentId, CancellationToken ct = default)
    {
        try
        {
            var changes = await schedule.ChangesSincePublicationAsync(tournamentId, draws, ct);
            if (changes.UpdateRequired) return;
            var open = await db.AdminNotifications.Where(n => n.Type == AdminNotificationTypes.ScheduleUpdateRequired
                && n.TournamentId == tournamentId && n.ResolvedAt == null).ToListAsync(ct);
            if (open.Count == 0) return;
            foreach (var n in open)
            {
                n.ResolvedAt = DateTime.UtcNow;
                n.ResolvedNote = $"Resolved — the updated bout schedule (version {changes.Version}) was approved and published.";
            }
            await db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Could not resolve the Bout Schedule notification for tournament {TournamentId}.", tournamentId);
        }
    }

    private static string Join(IReadOnlyList<string> items) =>
        items.Count <= 1 ? string.Join("", items) : string.Join(", ", items.Take(items.Count - 1)) + " and " + items[^1];
}
