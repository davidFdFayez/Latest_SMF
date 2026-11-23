using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The admin Check-in &amp; Medical page — REQ-08 and REQ-09 read back as one
/// list: every live entry in division order with where it stands in the three
/// readiness steps. The steps themselves are recorded through the readiness
/// routes in <see cref="TournamentEndpoints"/>; this only reads.
///
/// Entries come from the Participants loader so the two pages agree on who is
/// registered, in what order, and what their Medical File still owes.
/// </summary>
public static class TournamentReadinessEndpoints
{
    public static void MapTournamentReadiness(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/tournaments").WithTags("Tournaments");

        group.MapGet("/{id:int}/readiness", async (int id, SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var (participants, _) = await TournamentParticipantsEndpoints.LoadAsync(tournament, db, ct);
            var year = TournamentEligibility.TournamentYear(tournament);

            // Weight-class moves made at the weigh-in, from the audit trail
            // the move writes — the entry itself keeps only the class it is in.
            var ids = participants.Select(p => p.Entry.Id).ToList();
            var locked = await medical.LockedAthletesAsync(
                participants.Select(p => p.Entry.AthleteRegistrationId).Distinct().ToList(), ct);
            var moves = (await db.AuditLog.AsNoTracking()
                    .Where(a => a.EntityType == "tournament_entry" && a.Action == AuditActions.EntryUpdated
                                && ids.Contains(a.EntityId) && a.Details != null && a.Details.StartsWith("Weigh-in move"))
                    .OrderBy(a => a.Id)
                    .Select(a => new { a.EntityId, a.CreatedAt, a.ActorName, a.FromStatus, a.ToStatus })
                    .ToListAsync(ct))
                .ToLookup(a => a.EntityId);

            // The entries that are in a PUBLISHED bracket. An entry of a published division that is not in its
            // bracket (it joined after publication) is not locked by the draw and completes readiness normally.
            // Per division: an athlete transferred out of a published bracket still has a corner in it, but is not in
            // the published bracket of the division they are in now. And the bracket only protects an athlete who
            // holds approval or was not transferred in since publication (TournamentEntryService.InPublishedDrawAsync).
            var inPublishedDraw = (await db.Bouts.AsNoTracking()
                    .Where(b => b.TournamentId == id && db.TournamentDivisions.Any(d => d.Id == b.DivisionId && d.DrawPublishedAt != null))
                    .Select(b => new { b.DivisionId, b.RedEntryId, b.BlueEntryId, b.WinnerEntryId })
                    .ToListAsync(ct))
                .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId, b.WinnerEntryId }.OfType<int>().Select(e => (b.DivisionId, e)))
                .ToHashSet();

            // In the published bracket of the division the athlete is in now — and protected by it, unless transferred
            // in after publication and not approved again (TournamentEntryService.InPublishedDrawAsync, the same rule).
            var protectedIds = new HashSet<int>();
            foreach (var p in participants.Where(p => p.Entry.DivisionId is { } div && inPublishedDraw.Contains((div, p.Entry.Id))))
            {
                if (p.Entry.QualifiedAt is not null || await TournamentEntryService.InPublishedDrawAsync(db, p.Entry, ct))
                    protectedIds.Add(p.Entry.Id);
            }

            return Results.Ok(new
            {
                tournament = new { tournament.Id, tournament.NameEn, tournament.NameAr, tournament.StartDate },
                athletes = participants.Select(p => Describe(p, year, locked.Contains(p.Entry.AthleteRegistrationId),
                    moves[p.Entry.Id].Select(m => (object)new { at = m.CreatedAt, by = m.ActorName, from = m.FromStatus, to = m.ToStatus }),
                    protectedIds.Contains(p.Entry.Id))),
            });
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDirector);
    }

    private static object Describe(TournamentParticipantsEndpoints.Participant p, int year, bool medicalLocked,
        IEnumerable<object> moves, bool inPublishedDraw)
    {
        var e = p.Entry;
        var age = CompetitionCategories.CompetitionAge(p.DateOfBirth, year);
        var missing = p.Medical.Missing(age, p.Gender);
        var (state, step, done) = Progress(e);

        return new
        {
            e.Id,
            nameAr = p.NameAr,
            nameEn = p.NameEn,
            membershipNumber = e.AthleteRegistration?.MembershipNumber,
            reference = e.AthleteRegistration?.ReferenceNumber,
            gender = p.Gender,
            competitionAge = age,
            club = TournamentParticipantsEndpoints.ClubOf(e),
            division = e.Division is { } d
                ? new
                {
                    d.Id, d.Gender, d.Category, d.WeightLimitKg, d.WeightFloorKg,
                    heading = TournamentParticipantsEndpoints.DivisionHeading(d),
                    categoryLabel = CompetitionCategories.Label(d.Category).En,
                    weightLabel = d.WeightLabel(false),
                    // The accepted weigh-in range for this athlete's own category, gender and class.
                    weighInRange = WeighInRange.For(d).Describe(),
                    // For this athlete: their published draw. A late entrant (not in the published bracket) is
                    // treated as before publication, so the page offers the normal readiness steps.
                    drawPublished = d.DrawPublishedAt is not null && inPublishedDraw,
                    divisionDrawPublished = d.DrawPublishedAt is not null,
                }
                : null,
            e.Status,
            e.StatusReason,
            state,
            step,
            stepsDone = done,
            lateEntrant = e.Division?.DrawPublishedAt is not null && !inPublishedDraw,
            // Readiness is read-only here once approved or once the athlete is in a published draw.
            locked = e.QualifiedAt is not null || e.Status == EntryStatuses.Rejected || inPublishedDraw,
            checkIn = e.CheckedInAt is null ? null : new { at = e.CheckedInAt, by = e.CheckedInBy },
            medical = e.MedicalResult is null
                ? null
                : new
                {
                    result = e.MedicalResult, note = e.MedicalNote, at = e.MedicalRecordedAt, by = e.MedicalRecordedBy,
                    missingDocumentsReason = e.MedicalMissingDocumentsReason,
                },
            weighIn = e.WeighInResult is null && e.ActualWeightKg is null
                ? null
                : new
                {
                    result = e.WeighInResult, actualWeightKg = e.ActualWeightKg, at = e.WeighInAt, by = e.WeighInBy,
                    // Against the class the entry is in now, by the accepted weigh-in range.
                    withinClass = e.ActualWeightKg is { } kg && e.Division is { } d2
                        ? TournamentEntryService.Fits(d2, kg)
                        : (bool?)null,
                    verdict = e.ActualWeightKg is { } kg2 ? WeighInRange.For(e.Division).Check(kg2).Code() : null,
                    moves,
                },
            qualified = e.QualifiedAt is null ? null : new { at = e.QualifiedAt, by = e.QualifiedBy },
            // What the draw itself will use (DrawEligibility): approval on a
            // weigh-in that holds for the class the athlete is in now.
            drawEligible = e.Division is { } d3 && DrawEligibility.Eligible(e, d3),
            staleWeighIn = DrawEligibility.StaleWeighIn(e, e.Division),
            rejected = e.ReadinessRejectedAt is null
                ? null
                : new { at = e.ReadinessRejectedAt, by = e.ReadinessRejectedBy, reason = e.ReadinessRejectionReason },
            // An active Final Approval — here or in another tournament — holds the shared Medical File.
            medicalLocked,
            requirementsComplete = missing.Count == 0,
            requirements = TournamentParticipantsEndpoints.Requirements(p.Medical, age, p.Gender),
        };
    }

    /// <summary>
    /// Where the entry stands: the state, the step it is on (1 Check-in,
    /// 2 Medical Examination, 3 Weigh-in), and how many steps are passed.
    /// </summary>
    private static (string State, int Step, int Done) Progress(TournamentEntry e)
    {
        var done = (e.CheckedInAt is null ? 0 : 1)
                   + (e.MedicalResult == ReadinessResults.Passed ? 1 : 0)
                   + (e.WeighInResult == ReadinessResults.Passed ? 1 : 0);

        // A No Show at check-in stops them on step 1; at the weigh-in, on step 3.
        if (e.Status == EntryStatuses.Disqualified) return ("dsq", e.CheckedInAt is null ? 1 : 3, done);
        if (e.Status == EntryStatuses.Rejected) return ("rejected", 3, done);
        if (e.MedicalResult == ReadinessResults.Failed) return ("failed", 2, done);
        if (e.WeighInResult == ReadinessResults.Failed) return ("failed", 3, done);
        if (e.CheckedInAt is null) return ("checkin", 1, done);
        if (e.MedicalResult is null) return ("medical", 2, done);
        if (e.WeighInResult is null) return ("weighin", 3, done);
        return (e.QualifiedAt is null ? "ready" : "qualified", 3, done);
    }
}
