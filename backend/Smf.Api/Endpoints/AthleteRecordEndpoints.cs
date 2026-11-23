using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The signed-in athlete's own competition record, for their account page:
/// the tournaments they were entered in, the bouts decided in them, and the
/// figures that follow from those. Nothing else.
///
/// Everything here is read from what the system records: entries, and bouts
/// with a winner. There is no result-entry step yet, so a winner is only ever
/// set when an opponent withdrew; medals, placings and a ranking are not
/// recorded anywhere, and are reported as absent rather than worked out.
/// </summary>
public static class AthleteRecordEndpoints
{
    /// <summary>Entries that never turned into taking part.</summary>
    private static readonly string[] NotTakingPart = [EntryStatuses.Withdrawn, EntryStatuses.NotEligible];

    /// <summary>Tournaments still ahead or under way: the same "current" as the club's statistics.</summary>
    private static readonly string[] Current =
        [TournamentStatuses.Published, TournamentStatuses.Closed, TournamentStatuses.Running];

    public static void MapAthleteRecord(this RouteGroupBuilder group)
    {
        group.MapGet("/athlete/record", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            // Only an athlete has a record, and only their own: the registration
            // comes from the account, never from the request.
            if (!holder.IsAthlete) return Results.Forbid();

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

            var now = DateTime.UtcNow;

            // The athlete's category this year, by the general rule — a profile
            // fact, not a tournament's eligibility (that is worked out per
            // tournament, from its own year, when they enter).
            var categoryValue = CompetitionCategories.PrimaryFor(TournamentEligibility.DateOfBirthOf(registration), now.Year);
            var categoryLabel = CompetitionCategories.Label(categoryValue);

            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Tournament)
                .Include(e => e.Division)
                .Where(e => e.AthleteRegistrationId == registration.Id)
                .Where(e => e.Tournament!.Status != TournamentStatuses.Draft
                            && e.Tournament.Status != TournamentStatuses.Cancelled)
                .ToListAsync(ct);

            var entryIds = entries.Select(e => e.Id).ToList();
            var divisionIds = entries.Where(e => e.DivisionId is not null).Select(e => e.DivisionId!.Value).Distinct().ToList();

            // Every bout in the athlete's divisions: their own, and enough of
            // the rest to name each round as the draw does.
            var divisionBouts = await db.Bouts.AsNoTracking()
                .Where(b => divisionIds.Contains(b.DivisionId))
                .ToListAsync(ct);
            var mine = divisionBouts
                .Where(b => (b.RedEntryId is { } red && entryIds.Contains(red))
                            || (b.BlueEntryId is { } blue && entryIds.Contains(blue)))
                .ToList();

            var opponentIds = mine
                .Select(b => entryIds.Contains(b.RedEntryId ?? 0) ? b.BlueEntryId : b.RedEntryId)
                .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();
            var opponents = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.AthleteRegistration)
                .Where(e => opponentIds.Contains(e.Id))
                .ToDictionaryAsync(e => e.Id, ct);

            object? Bout(Bout b)
            {
                var ownId = entryIds.Contains(b.RedEntryId ?? 0) ? b.RedEntryId!.Value : b.BlueEntryId!.Value;
                var opponentId = ownId == b.RedEntryId ? b.BlueEntryId : b.RedEntryId;
                var opponent = opponentId is { } id ? opponents.GetValueOrDefault(id)?.AthleteRegistration : null;

                var inDivision = divisionBouts.Where(d => d.DivisionId == b.DivisionId).ToList();
                var totalRounds = inDivision.Max(d => d.Round);
                var firstRoundPartial = inDivision.Any(d => d.Round == 1 && d.IsBye && !d.IsWalkover);
                var round = BoutRounds.Name(b.Round, totalRounds, b.Round == 1 && firstRoundPartial);

                return new
                {
                    b.Id,
                    b.Round,
                    roundAr = round.Ar,
                    roundEn = round.En,
                    BoutNumber = b.OfficialBoutNumber, // official (published) number only
                    b.ScheduledDate,
                    corner = ownId == b.RedEntryId ? "red" : "blue",
                    // A bye or a walkover is decided without a bout being fought.
                    outcome = b.WinnerEntryId is null ? null
                        : b.WinnerEntryId == ownId
                            ? (b.IsWalkover ? "walkover_win" : b.IsBye ? "bye" : "win")
                            : "loss",
                    opponentNameAr = opponent is null ? null : MemberEndpoints.NameOf(opponent, true),
                    opponentNameEn = opponent is null ? null : MemberEndpoints.NameOf(opponent, false),
                };
            }

            var record = entries
                .OrderByDescending(e => e.Tournament!.StartDate)
                .Select(e => new
                {
                    e.Id,
                    tournamentId = e.TournamentId,
                    tournamentNameAr = e.Tournament!.NameAr,
                    tournamentNameEn = e.Tournament.NameEn,
                    tournamentStatus = e.Tournament.Status,
                    e.Tournament.StartDate,
                    e.Tournament.EndDate,
                    locationAr = e.Tournament.LocationAr,
                    locationEn = e.Tournament.LocationEn,
                    divisionAr = e.Division?.Describe(true),
                    divisionEn = e.Division?.Describe(false),
                    e.Status,
                    statusAr = EntryStatuses.Labels.GetValueOrDefault(e.Status).Ar,
                    statusEn = EntryStatuses.Labels.GetValueOrDefault(e.Status).En,
                    bouts = mine.Where(b => b.RedEntryId == e.Id || b.BlueEntryId == e.Id)
                        .OrderBy(b => b.Round)
                        .Select(Bout)
                        .ToList(),
                })
                .ToList();

            var taking = entries.Where(e => !NotTakingPart.Contains(e.Status)).ToList();
            // Fought bouts only: a bye or a walkover is not a win, nor a loss.
            var fought = mine.Where(b => b.WinnerEntryId is not null && !b.IsBye).ToList();

            var perYear = taking.GroupBy(e => e.Tournament!.StartDate.Year).ToDictionary(g => g.Key, g => g.Count());
            var participation = perYear.Count == 0
                ? []
                : Enumerable.Range(perYear.Keys.Min(), Math.Max(perYear.Keys.Max(), now.Year) - perYear.Keys.Min() + 1)
                    .Select(y => new { year = y, tournaments = perYear.GetValueOrDefault(y) })
                    .ToList<object>();

            return Results.Ok(new
            {
                category = categoryValue is null ? null : new { value = categoryValue, ar = categoryLabel.Ar, en = categoryLabel.En },
                categoryYear = now.Year,
                totals = new
                {
                    participations = taking.Count,
                    current = taking.Count(e => Current.Contains(e.Tournament!.Status)),
                    completed = taking.Count(e => e.Tournament!.Status == TournamentStatuses.Completed),
                    withdrawn = entries.Count - taking.Count,
                    boutsDecided = fought.Count,
                    wins = fought.Count(b => entryIds.Contains(b.WinnerEntryId!.Value)),
                    losses = fought.Count(b => !entryIds.Contains(b.WinnerEntryId!.Value)),
                },
                participation,
                entries = record,
                // Nothing in the system records medals, placings or a ranking.
                medals = (object?)null,
                ranking = (object?)null,
            });
        });
    }
}
