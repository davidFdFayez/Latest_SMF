using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// Entering athletes, and getting them ready to fight — Phase 3 REQ-03, REQ-08
/// and REQ-09.
///
/// The three readiness steps are deliberately separate calls rather than one
/// form: they happen at different desks, minutes or hours apart, and each is
/// recorded by whoever did it.
/// </summary>
public class TournamentEntryService(SmfDbContext db, AuditLogger audit)
{
    /* ── REQ-03: entry ──────────────────────────────────────────────────── */

    public sealed record EntryRequest(
        int AthleteRegistrationId,
        int? DivisionId,
        string? Track,
        string? Category,
        decimal? DeclaredWeightKg,
        decimal? HeightCm,
        string? ClubName,
        string? TrainingCentre,
        string? CoachName,
        string? CoachPhone);

    /// <summary>
    /// Enters an athlete. Eligibility is re-checked here even though the form
    /// only offered eligible options, because the form is not the authority
    /// (REQ-03 rules 2 to 5).
    /// </summary>
    public async Task<(Outcome Result, TournamentEntry? Entry)> EnterAsync(
        Tournament tournament,
        EntryRequest request,
        string source,
        string? sourceName,
        AdminIdentity.Actor? actor,
        CancellationToken cancellationToken = default)
    {
        var athlete = await db.Registrations
            .FirstOrDefaultAsync(r => r.Id == request.AthleteRegistrationId, cancellationToken);

        if (athlete is null) return (Outcome.NotFound(), null);

        var divisions = await db.TournamentDivisions
            .Where(d => d.TournamentId == tournament.Id)
            .ToListAsync(cancellationToken);

        var suspensions = await db.MedicalSuspensions
            .Where(s => s.AthleteRegistrationId == athlete.Id)
            .ToListAsync(cancellationToken);

        var already = await db.TournamentEntries.AnyAsync(
            e => e.TournamentId == tournament.Id && e.AthleteRegistrationId == athlete.Id,
            cancellationToken);

        var verdict = TournamentEligibility.Assess(
            tournament, athlete, divisions, suspensions, already, DateTime.UtcNow);

        if (!verdict.CanEnter)
        {
            var first = verdict.Barriers[0];
            return (Outcome.Conflict(first.Ar, first.En), null);
        }

        // The division has to be one the athlete may actually enter.
        TournamentDivision? division = null;
        if (request.DivisionId is { } divisionId)
        {
            division = divisions.FirstOrDefault(d => d.Id == divisionId);
            if (division is null) return (Outcome.NotFound(), null);

            var allowed = verdict.Options.SelectMany(o => o.Divisions).Any(d => d.DivisionId == divisionId);
            if (!allowed)
            {
                return (Outcome.Conflict(
                    "هذه الفئة غير متاحة لهذا اللاعب.",
                    "That division is not open to this athlete."), null);
            }
        }

        var category = division?.Category ?? request.Category;
        if (category is null)
        {
            return (Outcome.Invalid(
                "يجب تحديد الفئة أو فئة الوزن.",
                "A category or a weight class must be chosen."), null);
        }

        // REQ-02 rule 3 — one track, and it has to be the chosen category's.
        var track = CompetitionCategories.TrackOf(category);
        if (track is null)
        {
            return (Outcome.Invalid($"فئة غير معروفة: {category}.", $"Unknown category: {category}."), null);
        }

        if (request.Track is { } asked && asked != track)
        {
            return (Outcome.Invalid(
                "المسار المحدد لا يطابق الفئة المختارة.",
                "The chosen track does not match the chosen category."), null);
        }

        var entry = new TournamentEntry
        {
            TournamentId = tournament.Id,
            DivisionId = division?.Id,
            AthleteRegistrationId = athlete.Id,
            EnteredBy = source,
            EnteredByName = sourceName,
            Track = track,
            Category = category,
            DeclaredWeightKg = request.DeclaredWeightKg,
            HeightCm = request.HeightCm,
            ClubName = request.ClubName,
            TrainingCentre = request.TrainingCentre,
            CoachName = request.CoachName,
            CoachPhone = request.CoachPhone,
            Status = EntryStatuses.Registered,
        };

        db.TournamentEntries.Add(entry);

        if (actor is not null)
        {
            audit.Write(actor, AuditActions.EntryCreated, "tournament_entry", 0,
                athlete.ReferenceNumber,
                details: $"{tournament.NameEn}: {division?.Describe(false) ?? category}");
        }

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException)
        {
            // The unique index caught a double submit between the check above
            // and the insert.
            return (Outcome.Conflict(
                "اللاعب مسجل بالفعل في هذه البطولة.",
                "This athlete is already entered in this tournament."), null);
        }

        return (Outcome.Success(), entry);
    }

    /// <summary>
    /// REQ-03 rule 7 — the technical team may move an athlete between
    /// categories, tracks and weight classes after entry.
    /// </summary>
    public async Task<Outcome> AmendAsync(
        TournamentEntry entry,
        int? divisionId,
        decimal? declaredWeightKg,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (divisionId is { } id)
        {
            var division = await db.TournamentDivisions
                .FirstOrDefaultAsync(d => d.Id == id && d.TournamentId == entry.TournamentId, cancellationToken);

            if (division is null) return Outcome.NotFound();

            if (division.DrawPublishedAt is not null)
            {
                return Outcome.Conflict(
                    "لا يمكن النقل إلى فئة صدرت قرعتها؛ عدّل القرعة من صفحتها.",
                    "That division's draw is published; move the athlete from the draw page instead.");
            }

            var from = entry.DivisionId;
            entry.DivisionId = division.Id;
            entry.Category = division.Category;
            entry.Track = CompetitionCategories.TrackOf(division.Category) ?? entry.Track;

            audit.Write(actor, AuditActions.EntryUpdated, "tournament_entry", entry.Id,
                details: $"Division {from?.ToString() ?? "none"} -> {division.Id} ({division.Describe(false)}).");
        }

        if (declaredWeightKg is not null) entry.DeclaredWeightKg = declaredWeightKg;

        entry.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// Withdrawing. Before the draw the athlete simply leaves the division;
    /// after it their opponent walks over (REQ-10 rules 7 and 8), which the
    /// draw service applies.
    /// </summary>
    public async Task<Outcome> WithdrawAsync(
        TournamentEntry entry,
        string? reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        entry.Status = EntryStatuses.Withdrawn;
        entry.StatusReason = reason;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.EntryWithdrawn, "tournament_entry", entry.Id, details: reason);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /* ── REQ-08: check-in and the medical examination ───────────────────── */

    public async Task<Outcome> CheckInAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (entry.Status is EntryStatuses.Withdrawn or EntryStatuses.Disqualified)
        {
            return Outcome.Conflict(
                "لا يمكن تسجيل حضور لاعب منسحب أو مستبعد.",
                "A withdrawn or disqualified athlete cannot be checked in.");
        }

        entry.CheckedInAt = DateTime.UtcNow;
        entry.CheckedInBy = actor.Username;
        if (entry.Status == EntryStatuses.Registered) entry.Status = EntryStatuses.CheckedIn;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.CheckedIn, "tournament_entry", entry.Id);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-08 rules 5 and 6. A pass may be given with documents still missing,
    /// but only with a reason — the decision is the technical team's and the
    /// reason is what makes it accountable.
    /// </summary>
    public async Task<Outcome> RecordMedicalAsync(
        TournamentEntry entry,
        string result,
        string? note,
        bool documentsMissing,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (result is not (ReadinessResults.Passed or ReadinessResults.Failed))
            return Outcome.Invalid("نتيجة غير معروفة.", "Unknown result.");

        if (entry.CheckedInAt is null)
        {
            return Outcome.Conflict(
                "يجب تسجيل الحضور قبل الفحص الطبي.",
                "The athlete has to be checked in before the examination.");
        }

        if (result == ReadinessResults.Passed && documentsMissing && string.IsNullOrWhiteSpace(note))
        {
            return Outcome.Invalid(
                "اعتماد الفحص مع نقص المستندات يتطلب ذكر السبب.",
                "Passing with documents missing requires a reason.");
        }

        entry.MedicalResult = result;
        entry.MedicalNote = note;
        entry.MedicalRecordedAt = DateTime.UtcNow;
        entry.MedicalRecordedBy = actor.Username;
        entry.UpdatedAt = DateTime.UtcNow;

        // REQ-08 rule 7 — a failure ends it.
        if (result == ReadinessResults.Failed)
        {
            entry.Status = EntryStatuses.NotEligible;
            entry.StatusReason = note;
        }

        audit.Write(actor, AuditActions.MedicalRecorded, "tournament_entry", entry.Id,
            toStatus: result, details: note);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /* ── REQ-09: the weigh-in ───────────────────────────────────────────── */

    /// <summary>What the scales say, and what the system makes of it.</summary>
    public sealed record WeighInView(
        decimal ActualWeightKg,
        bool WithinRegisteredClass,
        string? RegisteredClassLabel,
        string? ActualClassLabel,
        IReadOnlyList<TournamentDivision> Alternatives);

    /// <summary>
    /// REQ-09 rules 2 to 4 — compares the measured weight against the class
    /// the athlete entered, and where it falls outside, offers the classes in
    /// this tournament they could move to instead.
    /// </summary>
    public async Task<WeighInView?> PreviewWeighInAsync(
        TournamentEntry entry,
        decimal actualWeightKg,
        CancellationToken cancellationToken = default)
    {
        var divisions = await db.TournamentDivisions
            .Where(d => d.TournamentId == entry.TournamentId && d.Category == entry.Category)
            .ToListAsync(cancellationToken);

        var registered = divisions.FirstOrDefault(d => d.Id == entry.DivisionId);
        var gender = registered?.Gender;

        var within = registered is not null && Fits(registered, actualWeightKg);

        var alternatives = divisions
            .Where(d => d.Id != entry.DivisionId)
            .Where(d => gender is null || d.Gender == gender)
            .Where(d => Fits(d, actualWeightKg))
            .Where(d => d.DrawPublishedAt is null)
            .OrderBy(d => d.SortWeight)
            .ToList();

        var actualClass = divisions
            .Where(d => gender is null || d.Gender == gender)
            .OrderBy(d => d.SortWeight)
            .FirstOrDefault(d => Fits(d, actualWeightKg));

        return new WeighInView(
            actualWeightKg,
            within,
            registered?.Describe(arabic: false),
            actualClass?.Describe(arabic: false),
            alternatives);
    }

    /// <summary>
    /// Records the weigh-in. Passing while outside the entered class is
    /// refused: REQ-09 rule 4 gives two ways out and neither is "pass anyway" —
    /// move the athlete to a class that fits, or fail them.
    /// </summary>
    public async Task<Outcome> RecordWeighInAsync(
        TournamentEntry entry,
        decimal actualWeightKg,
        string result,
        int? moveToDivisionId,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (result is not (ReadinessResults.Passed or ReadinessResults.Failed))
            return Outcome.Invalid("نتيجة غير معروفة.", "Unknown result.");

        if (entry.MedicalResult != ReadinessResults.Passed)
        {
            return Outcome.Conflict(
                "يجب اجتياز الفحص الطبي قبل الوزن.",
                "The medical examination has to be passed before the weigh-in.");
        }

        if (moveToDivisionId is { } moveTo)
        {
            var division = await db.TournamentDivisions
                .FirstOrDefaultAsync(d => d.Id == moveTo && d.TournamentId == entry.TournamentId, cancellationToken);

            if (division is null) return Outcome.NotFound();

            if (division.DrawPublishedAt is not null)
            {
                return Outcome.Conflict(
                    "لا يمكن النقل إلى فئة صدرت قرعتها.",
                    "That division's draw is already published.");
            }

            if (!Fits(division, actualWeightKg))
            {
                return Outcome.Invalid(
                    "الوزن الفعلي خارج الفئة المختارة للنقل.",
                    "The measured weight does not fit the class you are moving them to.");
            }

            entry.DivisionId = division.Id;
            entry.Category = division.Category;
        }

        if (result == ReadinessResults.Passed)
        {
            var division = await db.TournamentDivisions
                .FirstOrDefaultAsync(d => d.Id == entry.DivisionId, cancellationToken);

            if (division is null || !Fits(division, actualWeightKg))
            {
                return Outcome.Conflict(
                    "الوزن الفعلي خارج فئة اللاعب: انقله إلى فئة مناسبة أو سجّل النتيجة Failed.",
                    "The measured weight is outside this athlete's class: move them to one that fits, or record Failed.");
            }
        }

        entry.ActualWeightKg = actualWeightKg;
        entry.WeighInResult = result;
        entry.WeighInAt = DateTime.UtcNow;
        entry.WeighInBy = actor.Username;
        entry.UpdatedAt = DateTime.UtcNow;

        if (result == ReadinessResults.Failed) entry.Status = EntryStatuses.NotEligible;

        audit.Write(actor, AuditActions.WeighInRecorded, "tournament_entry", entry.Id,
            toStatus: result, details: $"{actualWeightKg:0.##} kg");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>REQ-09 rule 6 — not appearing at the weigh-in is a disqualification.</summary>
    public async Task<Outcome> MarkNoShowAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        entry.Status = EntryStatuses.Disqualified;
        entry.StatusReason = "Did not appear at the weigh-in (DSQ).";
        entry.WeighInResult = ReadinessResults.Failed;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.WeighInRecorded, "tournament_entry", entry.Id,
            toStatus: EntryStatuses.Disqualified, details: "No show at the weigh-in.");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-09 rule 7 — the technical director's approval, which is what puts
    /// an athlete into the pool the draw is made from. Nothing else does.
    /// </summary>
    public async Task<Outcome> ApproveReadinessAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (entry.CheckedInAt is null
            || entry.MedicalResult != ReadinessResults.Passed
            || entry.WeighInResult != ReadinessResults.Passed)
        {
            return Outcome.Conflict(
                "لا يمكن الاعتماد قبل اجتياز الحضور والفحص الطبي والوزن.",
                "Check-in, the medical examination and the weigh-in all have to be passed first.");
        }

        if (entry.DivisionId is null)
        {
            return Outcome.Conflict(
                "لا يمكن الاعتماد بدون فئة وزن.",
                "The athlete needs a weight class before they can be approved.");
        }

        entry.Status = EntryStatuses.Qualified;
        entry.QualifiedAt = DateTime.UtcNow;
        entry.QualifiedBy = actor.Username;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.ReadinessApproved, "tournament_entry", entry.Id,
            toStatus: EntryStatuses.Qualified);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>Whether a measured weight belongs in a division's class.</summary>
    private static bool Fits(TournamentDivision division, decimal weightKg) =>
        division.IsOpenClass
            ? division.WeightFloorKg is null || weightKg > division.WeightFloorKg
            : weightKg <= division.WeightLimitKg
              && (division.WeightFloorKg is null || weightKg > division.WeightFloorKg);
}
