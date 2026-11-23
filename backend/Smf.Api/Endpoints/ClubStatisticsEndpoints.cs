using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// A club's statistics, for the club itself and for the coaches linked to it
/// (a coach sees their club's roster, not one of their own) — read-only, and
/// only from relationships the system already keeps:
///
/// <list type="bullet">
/// <item>A club's athletes and coaches are the member accounts attached to it
/// (<see cref="MemberAccount.ClubRegistrationId"/>) — the club's roster.</item>
/// <item>Gender and age category come from each athlete's own membership
/// record; the category is the one <see cref="CompetitionCategories.PrimaryFor"/>
/// assigns for this year.</item>
/// <item>Tournament participation is the entries those athletes hold. An entry
/// names the athlete, not the club, so it is reached through the roster.</item>
/// </list>
///
/// Player classification (gold, silver, bronze) has no source in the system,
/// so it is reported as unavailable rather than made up.
/// </summary>
public static class ClubStatisticsEndpoints
{
    /// <summary>Entries that never turned into taking part.</summary>
    private static readonly string[] NotTakingPart = [EntryStatuses.Withdrawn, EntryStatuses.NotEligible];

    /// <summary>Tournaments still ahead or under way: what "currently" means here.</summary>
    private static readonly string[] Current =
        [TournamentStatuses.Published, TournamentStatuses.Closed, TournamentStatuses.Running];

    public static void MapClubStatistics(this RouteGroupBuilder group)
    {
        group.MapGet("/club/statistics", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsClub && !holder.IsCoach) return Results.Forbid();

            // The club whose roster this is: a club's own, or the one a coach
            // is linked to. It comes from the account (re-read on every
            // request), never from the request, so nobody can name another
            // club's. A coach with no club has an empty roster.
            var clubId = holder.ClubScope ?? 0;

            var roster = await db.MemberAccounts.AsNoTracking()
                .Include(a => a.Registration)
                .Where(a => a.ClubRegistrationId == clubId && clubId != 0 && a.IsActive)
                .ToListAsync(ct);

            var athletes = roster.Where(a => a.Kind == MemberAccountKinds.Athlete).ToList();
            var coaches = roster.Count(a => a.Kind == MemberAccountKinds.Coach);
            var athleteIds = athletes.Select(a => a.RegistrationId).Distinct().ToList();

            /* ── gender and age category, from each athlete's record ─────── */
            var year = DateTime.UtcNow.Year;
            int male = 0, female = 0, genderUnknown = 0, categoryUnknown = 0;
            var byCategory = CompetitionCategories.All.ToDictionary(c => c.Value, _ => 0);

            foreach (var registration in athletes.Select(a => a.Registration).OfType<Registration>())
            {
                switch (TournamentEligibility.GenderOf(registration))
                {
                    case "male": male++; break;
                    case "female": female++; break;
                    default: genderUnknown++; break;
                }

                var category = CompetitionCategories.PrimaryFor(TournamentEligibility.DateOfBirthOf(registration), year);
                if (category is not null && byCategory.ContainsKey(category)) byCategory[category]++;
                else categoryUnknown++;
            }

            /* ── tournaments, through the athletes' entries ─────────────── */
            var entries = await db.TournamentEntries.AsNoTracking()
                .Where(e => athleteIds.Contains(e.AthleteRegistrationId) && !NotTakingPart.Contains(e.Status))
                .Select(e => new
                {
                    e.TournamentId,
                    e.AthleteRegistrationId,
                    e.Tournament!.Status,
                    e.Tournament.StartDate,
                })
                .Where(e => e.Status != TournamentStatuses.Cancelled && e.Status != TournamentStatuses.Draft)
                .ToListAsync(ct);

            var current = entries.Where(e => Current.Contains(e.Status)).ToList();

            // Tournaments per year, from the first the club took part in to
            // this one; a year with none is a real zero, not a gap.
            var perYear = entries
                .GroupBy(e => e.StartDate.Year)
                .ToDictionary(g => g.Key, g => g.Select(e => e.TournamentId).Distinct().Count());
            var participation = perYear.Count == 0
                ? []
                : Enumerable.Range(perYear.Keys.Min(), Math.Max(perYear.Keys.Max(), year) - perYear.Keys.Min() + 1)
                    .Select(y => new { year = y, tournaments = perYear.GetValueOrDefault(y) })
                    .ToList<object>();

            return Results.Ok(new
            {
                linkedToClub = clubId != 0,
                totals = new
                {
                    athletes = athletes.Count,
                    coaches,
                    athletesInTournaments = current.Select(e => e.AthleteRegistrationId).Distinct().Count(),
                    tournaments = current.Select(e => e.TournamentId).Distinct().Count(),
                },
                gender = new { male, female, unknown = genderUnknown },
                categories = CompetitionCategories.All.Select(c => new
                {
                    value = c.Value,
                    ar = c.Ar,
                    en = c.En,
                    count = byCategory[c.Value],
                }),
                categoryUnknown,
                participation,
                // No classification exists anywhere in the system yet.
                classification = (object?)null,
            });
        });
    }
}
