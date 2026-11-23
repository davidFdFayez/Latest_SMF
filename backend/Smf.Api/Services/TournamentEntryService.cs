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

        // A division carries its own category: a request naming a different
        // one is contradicting itself, not choosing.
        if (division is not null && request.Category is { } named && named != division.Category)
        {
            return (Outcome.Invalid(
                "الفئة المحددة لا تطابق فئة الوزن المختارة.",
                "The chosen category does not match the chosen weight class."), null);
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

        /* A Division is Category + Gender + Weight Class (REQ-02 rule 5), and
           the athlete picks a class when they register (REQ-03 rule 6). So an
           entry that named only a category still has to land in one: the class
           its declared weight falls into. Without that it would be an entry in
           no division, which weighs in against nothing and appears in no
           bracket — registered as far as the athlete can see, and absent on
           the day. */
        if (division is null)
        {
            var open = verdict.Options.FirstOrDefault(o => o.Category == category);
            if (open is null)
            {
                return (Outcome.Conflict(
                    "هذه الفئة غير متاحة لهذا اللاعب.",
                    "That category is not open to this athlete."), null);
            }

            if (request.DeclaredWeightKg is not { } declared)
            {
                return (Outcome.Invalid(
                    "يجب تحديد فئة الوزن أو الوزن الحالي.",
                    "A weight class must be chosen, or a current weight given to place one."), null);
            }

            var landed = open.Divisions.FirstOrDefault(d =>
                (d.WeightFloorKg is null || declared > d.WeightFloorKg)
                && (d.WeightLimitKg is null || declared <= d.WeightLimitKg));

            if (landed is null)
            {
                return (Outcome.Conflict(
                    $"لا توجد فئة وزن في هذه البطولة تناسب {declared:0.##} كجم.",
                    $"This tournament runs no weight class that {declared:0.##} kg falls into."), null);
            }

            division = divisions.First(d => d.Id == landed.DivisionId);
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
    /// categories, tracks and weight classes after entry. Held to the same
    /// readiness rule as the Participants edit: a weigh-in result or Final
    /// Draw Approval given for the old class does not travel with the athlete
    /// (<see cref="ClearForClassChangeAsync"/>), and neither the old nor the
    /// new division may have a published draw.
    /// </summary>
    public async Task<Outcome> AmendAsync(
        TournamentEntry entry,
        int? divisionId,
        decimal? declaredWeightKg,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        string? reason = null)
    {
        if (divisionId is { } id && id != entry.DivisionId)
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

            if (entry.DivisionId is { } fromId
                && await db.TournamentDivisions.AnyAsync(d => d.Id == fromId && d.DrawPublishedAt != null, cancellationToken))
            {
                return Outcome.Conflict(
                    "صدرت قرعة فئة اللاعب الحالية؛ عدّل القرعة من صفحتها.",
                    "The athlete's current division has a published draw; change it from the draw page instead.");
            }

            var (refused, cleared) = await ClearForClassChangeAsync(entry, reason, cancellationToken);
            if (refused is not null) return refused;

            var from = entry.DivisionId;
            entry.DivisionId = division.Id;
            entry.Category = division.Category;
            entry.Track = CompetitionCategories.TrackOf(division.Category) ?? entry.Track;

            audit.Write(actor, AuditActions.EntryUpdated, "tournament_entry", entry.Id,
                details: $"Division {from?.ToString() ?? "none"} -> {division.Id} ({division.Describe(false)}).{cleared}");
        }

        if (declaredWeightKg is not null) entry.DeclaredWeightKg = declaredWeightKg;

        entry.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// The Participants page's correction of an entry's category and weight
    /// class (REQ-03 rule 7). Unlike <see cref="AmendAsync"/> — the technical
    /// team's free move — this is held to the same rules as entering: the
    /// category must be one the athlete's competition age admits, and the
    /// class one the tournament runs for that category and the athlete's
    /// gender, on the official table. Only the entry changes; the athlete's
    /// profile is never touched.
    /// </summary>
    /// <param name="entry">Loaded with its tournament and athlete.</param>
    /// <param name="reason">Required when the change clears a weigh-in result or Final Draw Approval.</param>
    public async Task<Outcome> ChangeCategoryAsync(
        TournamentEntry entry,
        string? category,
        int? divisionId,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        string? reason = null)
    {
        if (entry.Tournament is null || entry.AthleteRegistration is null) return Outcome.NotFound();

        if (entry.Status == EntryStatuses.Withdrawn)
        {
            return Outcome.Conflict("لا يمكن تعديل مشاركة منسحبة.", "A withdrawn entry cannot be changed.");
        }

        if (string.IsNullOrWhiteSpace(category) || CompetitionCategories.All.All(c => c.Value != category))
        {
            return Outcome.Invalid("يجب اختيار الفئة.", "Choose a category.");
        }

        if (divisionId is null)
        {
            return Outcome.Invalid("يجب اختيار فئة الوزن.", "Choose a weight class.");
        }

        var dateOfBirth = TournamentEligibility.DateOfBirthOf(entry.AthleteRegistration);
        var gender = TournamentEligibility.GenderOf(entry.AthleteRegistration);
        var year = TournamentEligibility.TournamentYear(entry.Tournament);

        if (CompetitionCategories.EligibleForTournament(dateOfBirth, year).All(c => c.Value != category))
        {
            return Outcome.Invalid(
                "عمر اللاعب في البطولة لا يسمح بهذه الفئة.",
                "The athlete's competition age does not admit them to that category.");
        }

        var division = await db.TournamentDivisions
            .FirstOrDefaultAsync(d => d.Id == divisionId && d.TournamentId == entry.TournamentId, cancellationToken);

        if (division is null || division.Category != category || division.Gender != gender
            || !WeightClasses.IsOfficial(division.Category, division.Gender, division.WeightLimitKg, division.WeightFloorKg))
        {
            return Outcome.Invalid(
                "فئة الوزن ليست ضمن فئات البطولة لهذه الفئة وجنس اللاعب.",
                "That weight class is not one this tournament runs for the category and the athlete's gender.");
        }

        if (division.Id == entry.DivisionId && entry.Category == category) return Outcome.Success();

        // Every move needs a written reason (it is kept in the audit line).
        if (string.IsNullOrWhiteSpace(reason))
            return Outcome.Invalid("يجب ذكر سبب تغيير الفئة.", "A reason for the change is required.");
        if (reason.Trim().Length > 500)
            return Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters.");

        var previous = entry.DivisionId is { } fromId
            ? await db.TournamentDivisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == fromId, cancellationToken)
            : null;

        // Division-level lock: only a bout that has started (DrawService.BoutStarted — a recorded result or walkover)
        // in the SOURCE or the DESTINATION division blocks the move. Bouts of other divisions never do, and a scheduled
        // bout that has not started does not either. A published draw no longer blocks: its version stays on the
        // website until an administrator regenerates and republishes it from Draw Preparation.
        async Task<bool> StartedIn(int id) =>
            (await db.Bouts.AsNoTracking().Where(b => b.DivisionId == id).ToListAsync(cancellationToken)).Any(DrawService.BoutStarted);
        if (previous is not null && await StartedIn(previous.Id))
            return Outcome.Conflict(
                "بدأ نزال في فئة اللاعب الحالية؛ لا يمكن نقله منها.",
                "A bout in the athlete's current division has started; the athlete can no longer be moved out of it.");
        if (await StartedIn(division.Id))
            return Outcome.Conflict(
                "بدأ نزال في الفئة المختارة؛ لا يمكن نقل لاعب إليها.",
                "A bout in that division has started; athletes can no longer be moved into it.");

        var fromCategory = entry.Category;
        var fromWeight = previous?.WeightLabel(false) ?? "none";

        // A change of category alone (same class) is a change of division too.
        var (refused, cleared) = await ClearForClassChangeAsync(entry, reason, cancellationToken);
        if (refused is not null) return refused;
        if (cleared.Length == 0) cleared = $" Reason: {reason.Trim()}.";
        // A draw in either division is not changed here: Draw Preparation shows the difference, and regenerating and
        // republishing stay manual.
        var draws = new[] { previous?.Id, (int?)division.Id }.OfType<int>()
            .Where(id => db.Bouts.Any(b => b.DivisionId == id)).ToList();
        if (draws.Count > 0)
            cleared += $" Draws left unchanged (division {string.Join(", ", draws)}); Draw Preparation shows the change, "
                       + "regeneration and publication stay manual.";

        entry.DivisionId = division.Id;
        entry.Category = division.Category;
        entry.Track = CompetitionCategories.TrackOf(division.Category) ?? entry.Track;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.EntryUpdated, "tournament_entry", entry.Id,
            entityRef: entry.AthleteRegistration.MembershipNumber ?? entry.AthleteRegistration.ReferenceNumber,
            fromStatus: $"{CompetitionCategories.Label(fromCategory).En} / {fromWeight}",
            toStatus: $"{CompetitionCategories.Label(division.Category).En} / {division.WeightLabel(false)}",
            details: $"Participants edit: entry #{entry.Id}, athlete #{entry.AthleteRegistrationId}, "
                     + $"tournament #{entry.TournamentId}. Category {fromCategory} -> {division.Category}; "
                     + $"weight class {fromWeight} -> {division.WeightLabel(false)}; "
                     + $"division {previous?.Id.ToString() ?? "none"} -> {division.Id}. "
                     + $"Entry only; athlete profile unchanged.{cleared}");

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

    /// <summary>
    /// REQ-08 rule 4 — attendance, recorded by hand. Once only: a second click
    /// must not move the time the athlete actually arrived.
    ///
    /// Also the correction of a No Show recorded at check-in: with a reason,
    /// and before the draw is out, the athlete is checked in after all. The
    /// disqualification it replaces is written into the audit line, so the
    /// original record is not lost.
    /// </summary>
    public async Task<Outcome> CheckInAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        string? correctionReason = null)
    {
        var noShowAtCheckIn = entry.Status == EntryStatuses.Disqualified
                              && entry.WeighInResult == ReadinessResults.NoShow
                              && entry.CheckedInAt is null;
        if (noShowAtCheckIn)
        {
            if (string.IsNullOrWhiteSpace(correctionReason))
            {
                return Outcome.Invalid(
                    "تصحيح الغياب يتطلب ذكر سبب التصحيح.",
                    "Correcting a No Show requires a reason for the correction.");
            }
            if (correctionReason.Trim().Length > 500)
                return Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters.");
            if (await LockedAsync(entry, cancellationToken) is { } locked) return locked;

            var replaced = $"Replaces No Show (DSQ, T05) recorded {entry.WeighInAt:yyyy-MM-dd HH:mm} UTC by {entry.WeighInBy}.";
            entry.WeighInResult = null;
            entry.WeighInAt = null;
            entry.WeighInBy = null;
            entry.StatusReason = null;
            entry.Status = EntryStatuses.CheckedIn;
            entry.CheckedInAt = DateTime.UtcNow;
            entry.CheckedInBy = actor.Username;
            entry.UpdatedAt = DateTime.UtcNow;

            audit.Write(actor, AuditActions.CheckedIn, "tournament_entry", entry.Id,
                fromStatus: EntryStatuses.Disqualified, toStatus: EntryStatuses.CheckedIn,
                details: $"Correction: {correctionReason.Trim()} {replaced}");
            await db.SaveChangesAsync(cancellationToken);
            return Outcome.Success();
        }

        if (entry.Status is EntryStatuses.Withdrawn or EntryStatuses.Disqualified)
        {
            return Outcome.Conflict(
                "لا يمكن تسجيل حضور لاعب منسحب أو مستبعد.",
                "A withdrawn or disqualified athlete cannot be checked in.");
        }

        if (entry.CheckedInAt is not null)
        {
            return Outcome.Conflict(
                "تم تسجيل حضور هذا اللاعب مسبقًا.",
                "This athlete is already checked in.");
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
    /// REQ-08 rules 5 to 7. Passed may be given with documents still missing,
    /// and its notes are optional; the document statuses stay on the record
    /// beside it. Failed needs the reason for the failure. Changing a result
    /// already recorded is a correction: it needs its own reason (kept apart
    /// from the result's notes), and it is refused once the athlete is
    /// approved, rejected, or their division's draw is out.
    /// </summary>
    public async Task<Outcome> RecordMedicalAsync(
        TournamentEntry entry,
        string result,
        string? note,
        bool documentsMissing,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        string? correctionReason = null,
        string? missingDocumentsReason = null)
    {
        if (result is not (ReadinessResults.Passed or ReadinessResults.Failed))
            return Outcome.Invalid("نتيجة غير معروفة.", "Unknown result.");

        if (entry.Status is EntryStatuses.Withdrawn or EntryStatuses.Disqualified)
        {
            return Outcome.Conflict(
                "لا يمكن تسجيل الفحص للاعب منسحب أو مستبعد.",
                "A withdrawn or disqualified athlete cannot be examined.");
        }

        if (entry.CheckedInAt is null)
        {
            return Outcome.Conflict(
                "يجب تسجيل الحضور قبل الفحص الطبي.",
                "The athlete has to be checked in before the examination.");
        }

        if (await LockedAsync(entry, cancellationToken) is { } locked) return locked;

        // One reason per action. Failed — first time, from Passed, or a new
        // reason for a failure — needs the reason for the failure, which is
        // also the explanation of the change. Passed over a saved result
        // needs the reason for the correction. A first Passed needs nothing.
        var previous = entry.MedicalResult;
        var failing = result == ReadinessResults.Failed;

        if (failing && string.IsNullOrWhiteSpace(note))
        {
            return Outcome.Invalid(
                "تسجيل الفحص Failed يتطلب ذكر سبب الإخفاق.",
                "A Failed examination requires the reason for the failure.");
        }

        if (!failing && previous is not null && string.IsNullOrWhiteSpace(correctionReason))
        {
            return Outcome.Invalid(
                "تعديل نتيجة الفحص المسجلة يتطلب ذكر سبب التعديل.",
                "Changing a recorded examination result requires a reason for the correction.");
        }

        if (note is { Length: > 500 } || correctionReason is { Length: > 500 } || missingDocumentsReason is { Length: > 500 })
            return Outcome.Invalid("النص أطول من 500 حرف.", "Keep the reason to 500 characters.");

        // REQ-08 rule 6 — a Passed result with required documents missing
        // needs the reason. What is missing is worked out here, from the
        // athlete's Medical File and the same age and gender rules the desk
        // shows; whatever the client says about it is not trusted.
        var missing = failing ? [] : await MissingDocumentsAsync(entry, cancellationToken);
        if (!failing && missing.Count > 0 && string.IsNullOrWhiteSpace(missingDocumentsReason))
        {
            return Outcome.Invalid(
                "بعض المستندات المطلوبة غير مرفوعة. يجب ذكر سبب لاجتياز الفحص الطبي.",
                "One or more required documents are missing. A reason is required to pass the medical examination.");
        }

        var previousNote = entry.MedicalNote;
        entry.MedicalResult = result;
        entry.MedicalNote = failing || previous is null
            ? (string.IsNullOrWhiteSpace(note) ? null : note.Trim())
            // A correction to Passed keeps a Passed result's notes; a failure
            // reason does not survive into a pass.
            : previous == ReadinessResults.Passed ? previousNote : null;
        // Only a pass with documents missing carries this reason; anything else clears it.
        entry.MedicalMissingDocumentsReason = !failing && missing.Count > 0 ? missingDocumentsReason!.Trim() : null;
        entry.MedicalRecordedAt = DateTime.UtcNow;
        entry.MedicalRecordedBy = actor.Username;
        entry.UpdatedAt = DateTime.UtcNow;

        // REQ-08 rule 7 — a failure ends it.
        Restate(entry, result == ReadinessResults.Failed ? entry.MedicalNote : null);

        audit.Write(actor, AuditActions.MedicalRecorded, "tournament_entry", entry.Id,
            fromStatus: previous, toStatus: result,
            details: Join(
                failing ? $"Reason for failure: {entry.MedicalNote}"
                    : previous is null && entry.MedicalNote is not null ? $"Notes: {entry.MedicalNote}" : null,
                missing.Count > 0
                    ? $"Passed with documents missing ({string.Join(", ", missing.Select(m => m.En))}). Reason for missing documents: {entry.MedicalMissingDocumentsReason}"
                    : null,
                !failing && previous is not null ? $"Correction: {correctionReason!.Trim()}"
                    : failing && previous is not null ? $"Changed from {previous}; the reason for failure explains it." : null));
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// The required medical documents this entry's athlete is still missing,
    /// by the Medical File's own rules for their competition age and gender
    /// — the same list the examination desk shows. No file at all is
    /// everything missing.
    /// </summary>
    private async Task<IReadOnlyList<(string Ar, string En)>> MissingDocumentsAsync(
        TournamentEntry entry, CancellationToken cancellationToken)
    {
        var registration = entry.AthleteRegistration
            ?? await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == entry.AthleteRegistrationId, cancellationToken);
        var tournament = entry.Tournament
            ?? await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == entry.TournamentId, cancellationToken);
        var file = await db.AthleteMedicalFiles.AsNoTracking()
            .FirstOrDefaultAsync(f => f.AthleteRegistrationId == entry.AthleteRegistrationId, cancellationToken);

        var dateOfBirth = registration is null ? null : TournamentEligibility.DateOfBirthOf(registration);
        var gender = registration is null ? null : TournamentEligibility.GenderOf(registration);
        var age = tournament is null ? null : CompetitionCategories.CompetitionAge(dateOfBirth, TournamentEligibility.TournamentYear(tournament));
        return (file ?? new AthleteMedicalFile()).Missing(age, gender);
    }

    /* ── REQ-09: the weigh-in ───────────────────────────────────────────── */

    /// <summary>One class the athlete could be weighed into, and whether the scales put them in it.</summary>
    public sealed record WeighInClass(TournamentDivision Division, bool Fits);

    /// <summary>What the scales say, and what the system makes of it.</summary>
    public sealed record WeighInView(
        decimal ActualWeightKg,
        bool WithinRegisteredClass,
        WeighInVerdict Verdict,
        WeighInRange Range,
        string? RegisteredClassLabel,
        string? ActualClassLabel,
        IReadOnlyList<TournamentDivision> Alternatives,
        IReadOnlyList<WeighInClass> Classes);

    /// <summary>
    /// REQ-09 rules 2 to 4 — compares the measured weight against the class
    /// the athlete entered, and where it falls outside, offers the classes in
    /// this tournament they could move to instead: their own category and
    /// gender only, official classes only, and none whose draw is out.
    ///
    /// The accepted range is <see cref="WeighInRange"/>'s, from the division's
    /// own official list: first class limit − 2 kg to the limit, every later
    /// class above the preceding limit up to its own, the open class above the
    /// preceding limit. Never above a limit, never rounded.
    /// </summary>
    public async Task<WeighInView?> PreviewWeighInAsync(
        TournamentEntry entry,
        decimal actualWeightKg,
        CancellationToken cancellationToken = default)
    {
        var registered = entry.DivisionId is { } id
            ? await db.TournamentDivisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, cancellationToken)
            : null;

        var range = WeighInRange.For(registered);
        var verdict = range.Check(actualWeightKg);
        var within = verdict == WeighInVerdict.Matches;
        var classes = await AvailableClassesAsync(entry, registered, cancellationToken);

        return new WeighInView(
            actualWeightKg,
            within,
            verdict,
            range,
            registered?.Describe(arabic: false),
            classes.FirstOrDefault(d => Fits(d, actualWeightKg))?.Describe(arabic: false)
                ?? (within ? registered!.Describe(arabic: false) : null),
            classes.Where(d => d.Id != entry.DivisionId && Fits(d, actualWeightKg)).ToList(),
            classes.Select(d => new WeighInClass(d, Fits(d, actualWeightKg))).ToList());
    }

    /// <summary>
    /// The classes a weigh-in may move this athlete to: divisions of this
    /// tournament, in the category and gender of the division they are in,
    /// that the tournament's configuration still runs (not every official
    /// class, and not a division left over from an earlier set-up), lightest
    /// first, leaving out any whose draw is published. The athlete's own
    /// division is always included so it can be marked as current.
    /// </summary>
    public async Task<List<TournamentDivision>> AvailableClassesAsync(
        TournamentEntry entry,
        TournamentDivision? registered,
        CancellationToken cancellationToken = default)
    {
        if (registered is null) return [];

        var tournament = await db.Tournaments.AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == entry.TournamentId, cancellationToken);
        if (tournament is null) return [];

        var divisions = await db.TournamentDivisions.AsNoTracking()
            .Where(d => d.TournamentId == entry.TournamentId
                        && d.Category == registered.Category
                        && d.Gender == registered.Gender)
            .ToListAsync(cancellationToken);
        // A published draw does not keep a class off the list (the athlete joins as a late entrant; the published
        // version stays until an administrator regenerates and republishes it). A division where a bout has started
        // (DrawService.BoutStarted) does.
        var ids = divisions.Select(d => d.Id).ToList();
        var started = (await db.Bouts.AsNoTracking().Where(b => ids.Contains(b.DivisionId)).ToListAsync(cancellationToken))
            .Where(DrawService.BoutStarted).Select(b => b.DivisionId).ToHashSet();

        return divisions
            .Where(d => d.Id == registered.Id || !started.Contains(d.Id))
            .Where(d => WeightClasses.IsOfficial(d.Category, d.Gender, d.WeightLimitKg, d.WeightFloorKg))
            .Where(d => d.Id == registered.Id || TournamentService.Runs(tournament, d))
            .OrderBy(d => d.SortWeight)
            .ToList();
    }

    /// <summary>
    /// Records the weigh-in. Passing while outside the entered class is
    /// refused: REQ-09 rule 4 gives two ways out and neither is "pass anyway" —
    /// move the athlete to a class that fits, or fail them. Failed needs its
    /// reason and is refused for a weight that makes the class. Recording over
    /// a result already saved (a No Show included) is a correction and needs
    /// a reason; for a Failed, the failure reason is that reason.
    /// </summary>
    public async Task<Outcome> RecordWeighInAsync(
        TournamentEntry entry,
        decimal actualWeightKg,
        string result,
        int? moveToDivisionId,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        string? reason = null)
    {
        if (result is not (ReadinessResults.Passed or ReadinessResults.Failed))
            return Outcome.Invalid("نتيجة غير معروفة.", "Unknown result.");

        if (WeightInvalid(actualWeightKg) is { } invalid) return invalid;

        var noShow = entry.WeighInResult == ReadinessResults.NoShow;
        var replacedNoShow = noShow
            ? $"Replaces No Show (DSQ, T05) recorded {entry.WeighInAt:yyyy-MM-dd HH:mm} UTC by {entry.WeighInBy}."
            : null;
        if (entry.Status == EntryStatuses.Withdrawn || (entry.Status == EntryStatuses.Disqualified && !noShow))
        {
            return Outcome.Conflict(
                "لا يمكن تسجيل الوزن للاعب منسحب أو مستبعد.",
                "A withdrawn or disqualified athlete cannot be weighed in.");
        }

        if (entry.CheckedInAt is null || entry.MedicalResult != ReadinessResults.Passed)
        {
            return Outcome.Conflict(
                "يجب اجتياز الفحص الطبي قبل الوزن.",
                "The medical examination has to be passed before the weigh-in.");
        }

        if (await LockedAsync(entry, cancellationToken) is { } locked) return locked;

        var previous = entry.WeighInResult;
        if (previous is not null && string.IsNullOrWhiteSpace(reason))
        {
            return Outcome.Invalid(
                "تعديل نتيجة الوزن المسجلة يتطلب ذكر سبب التعديل.",
                "Changing a recorded weigh-in result requires a reason for the correction.");
        }

        if (moveToDivisionId is { } moveTo && moveTo != entry.DivisionId)
        {
            var moved = await MoveAsync(entry, moveTo, actualWeightKg, actor, requireFit: true, cancellationToken);
            if (!moved.Ok) return moved;
        }

        if (result == ReadinessResults.Passed)
        {
            var division = await db.TournamentDivisions
                .FirstOrDefaultAsync(d => d.Id == entry.DivisionId, cancellationToken);

            var range = WeighInRange.For(division);
            var verdict = range.Check(actualWeightKg);
            if (verdict == WeighInVerdict.NotConfigured)
            {
                return Outcome.Conflict(
                    "قاعدة الوزن لهذه الفئة غير مُعدّة؛ لا يمكن اعتماد النتيجة.",
                    $"Weight rule not configured: {range.Issue} The weigh-in cannot be passed until it is.");
            }
            if (verdict != WeighInVerdict.Matches)
            {
                return Outcome.Conflict(
                    "الوزن الفعلي خارج فئة اللاعب: انقله إلى فئة مناسبة أو سجّل النتيجة Failed.",
                    $"The measured weight of {WeighInWeights.Kg(actualWeightKg)} kg is outside this athlete's class "
                    + $"({Accepted(range)}): move them to one that fits, or record Failed.");
            }
        }
        else
        {
            // Failed is the other way out of a mismatch, and only that: with
            // its reason, and never for a weight that makes the class.
            if (string.IsNullOrWhiteSpace(reason))
            {
                return Outcome.Invalid(
                    "تسجيل الوزن Failed يتطلب ذكر سبب الإخفاق.",
                    "A Failed weigh-in requires the reason for the failure.");
            }

            var division = await db.TournamentDivisions.AsNoTracking()
                .FirstOrDefaultAsync(d => d.Id == entry.DivisionId, cancellationToken);
            var range = WeighInRange.For(division);
            var verdict = range.Check(actualWeightKg);
            if (verdict == WeighInVerdict.Matches)
            {
                return Outcome.Conflict(
                    "الوزن ضمن فئة اللاعب؛ لا يُسجَّل Failed إلا عند عدم المطابقة.",
                    "The measured weight makes the athlete's class; Failed is only for a weight-class mismatch.");
            }
            // Only a class the rules can judge may fail an athlete — never a
            // division whose class does not agree with the official list.
            if (verdict == WeighInVerdict.NotConfigured && division is not null)
            {
                return Outcome.Conflict(
                    "قاعدة الوزن لهذه الفئة غير مُعدّة؛ لا يمكن تسجيل Failed بناءً على حدّ غير معتمد.",
                    $"Weight rule not configured: {range.Issue} Failed cannot rest on a class that cannot be judged.");
            }
        }

        if (reason is { Length: > 500 })
            return Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters.");

        entry.ActualWeightKg = actualWeightKg;
        entry.WeighInResult = result;
        entry.WeighInAt = DateTime.UtcNow;
        entry.WeighInBy = actor.Username;
        entry.UpdatedAt = DateTime.UtcNow;

        var why = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        // Undoing a No Show lifts the disqualification it brought.
        if (noShow) { entry.Status = EntryStatuses.CheckedIn; entry.StatusReason = null; }
        Restate(entry, result == ReadinessResults.Failed ? why ?? "Failed at the weigh-in." : null);

        audit.Write(actor, AuditActions.WeighInRecorded, "tournament_entry", entry.Id,
            fromStatus: previous, toStatus: result,
            details: Join($"{WeighInWeights.Kg(actualWeightKg)} kg",
                why is null ? null
                    : result == ReadinessResults.Failed ? $"Reason for failure: {why}"
                    : previous is null ? why : $"Correction: {why}",
                noShow ? replacedNoShow : null));
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-09 rule 4, first way out — move the athlete to another class at the
    /// weigh-in. The measured weight is kept and the class changes on the
    /// entry only: category, gender and the athlete's profile stay as they
    /// are. Any weigh-in result already given was for the old class, so it is
    /// cleared (with a reason, as a correction) and has to be given again.
    /// </summary>
    public async Task<Outcome> MoveAtWeighInAsync(
        TournamentEntry entry,
        decimal actualWeightKg,
        int divisionId,
        string? reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (WeightInvalid(actualWeightKg) is { } invalid) return invalid;

        if (entry.Status is EntryStatuses.Withdrawn or EntryStatuses.Disqualified)
        {
            return Outcome.Conflict(
                "لا يمكن نقل لاعب منسحب أو مستبعد.",
                "A withdrawn or disqualified athlete cannot be moved.");
        }

        if (entry.CheckedInAt is null || entry.MedicalResult != ReadinessResults.Passed)
        {
            return Outcome.Conflict(
                "يجب اجتياز الفحص الطبي قبل الوزن.",
                "The medical examination has to be passed before the weigh-in.");
        }

        if (await LockedAsync(entry, cancellationToken) is { } locked) return locked;

        if (divisionId == entry.DivisionId)
            return Outcome.Invalid("اللاعب في هذه الفئة بالفعل.", "The athlete is already in that weight class.");

        var previous = entry.WeighInResult;
        if (previous is not null && string.IsNullOrWhiteSpace(reason))
        {
            return Outcome.Invalid(
                "تغيير الفئة بعد تسجيل نتيجة الوزن يتطلب ذكر السبب.",
                "Changing the class after a weigh-in result was recorded requires a reason.");
        }

        var moved = await MoveAsync(entry, divisionId, actualWeightKg, actor, requireFit: false, cancellationToken, reason);
        if (!moved.Ok) return moved;

        entry.ActualWeightKg = actualWeightKg;
        if (previous is not null)
        {
            entry.WeighInResult = null;
            entry.WeighInAt = null;
            entry.WeighInBy = null;
            Restate(entry, null);
        }

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>
    /// Moves the entry to another class of its own category and gender.
    /// Refused into or out of a published draw, and into anything that is not
    /// an official class the tournament runs.
    /// </summary>
    private async Task<Outcome> MoveAsync(
        TournamentEntry entry,
        int divisionId,
        decimal actualWeightKg,
        AdminIdentity.Actor actor,
        bool requireFit,
        CancellationToken cancellationToken,
        string? reason = null)
    {
        var current = entry.DivisionId is { } fromId
            ? await db.TournamentDivisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == fromId, cancellationToken)
            : null;

        if (current is null)
        {
            return Outcome.Conflict(
                "اللاعب بلا فئة وزن مسجلة؛ حدّدها من صفحة المشاركين.",
                "The athlete has no registered weight class; set one from Participants first.");
        }

        var division = (await AvailableClassesAsync(entry, current, cancellationToken))
            .FirstOrDefault(d => d.Id == divisionId);

        if (division is null)
        {
            var exists = await db.TournamentDivisions.AnyAsync(
                d => d.Id == divisionId && d.TournamentId == entry.TournamentId, cancellationToken);
            if (!exists) return Outcome.NotFound();

            return Outcome.Conflict(
                "هذه الفئة غير متاحة: يجب أن تكون من فئة اللاعب العمرية وجنسه، ولم يبدأ فيها أي نزال.",
                "That class is not available: it must be in the athlete's own category and gender, with no bout started.");
        }

        if (await InPublishedDrawAsync(db, entry, cancellationToken))
        {
            return Outcome.Conflict(
                "اللاعب ضمن القرعة المنشورة لفئته الحالية؛ عدّل القرعة من صفحتها.",
                "The athlete is in their current division's published draw; change it from the draw page instead.");
        }

        if ((await db.Bouts.AsNoTracking().Where(b => b.DivisionId == current.Id).ToListAsync(cancellationToken))
            .Any(DrawService.BoutStarted))
        {
            return Outcome.Conflict(
                "بدأ نزال في فئة اللاعب الحالية؛ لا يمكن نقله منها.",
                "A bout in the athlete's current division has started; the athlete can no longer be moved out of it.");
        }

        if (requireFit && !Fits(division, actualWeightKg))
        {
            return Outcome.Invalid(
                "الوزن الفعلي خارج الفئة المختارة للنقل.",
                "The measured weight does not fit the class you are moving them to.");
        }

        entry.DivisionId = division.Id;
        entry.UpdatedAt = DateTime.UtcNow;

        var why = string.IsNullOrWhiteSpace(reason) ? null : $" Reason: {reason.Trim()}";
        audit.Write(actor, AuditActions.EntryUpdated, "tournament_entry", entry.Id,
            fromStatus: $"{CompetitionCategories.Label(current.Category).En} / {current.WeightLabel(false)}",
            toStatus: $"{CompetitionCategories.Label(division.Category).En} / {division.WeightLabel(false)}",
            details: $"Weigh-in move: entry #{entry.Id}, actual weight {WeighInWeights.Kg(actualWeightKg)} kg. "
                     + $"Weight class {current.WeightLabel(false)} -> {division.WeightLabel(false)}; "
                     + $"division {current.Id} -> {division.Id}. Entry only; athlete profile unchanged.{why}"
                     + (await db.Bouts.AnyAsync(b => b.DivisionId == current.Id || b.DivisionId == division.Id, cancellationToken)
                         ? " Draws left unchanged; Draw Preparation shows the change, regeneration and publication stay manual."
                         : ""));

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-09 rule 6 — not appearing is a disqualification: DSQ, code T05. It
    /// is its own result, not a Failed, and only ever recorded by hand — at
    /// check-in, for an athlete who never arrived. An athlete who has checked
    /// in is not a No Show; the weigh-in records Passed, a move, or Failed on a
    /// mismatch. Weigh-in No Shows recorded before this rule stay as they are
    /// and can still be corrected through the weigh-in.
    /// </summary>
    public async Task<Outcome> MarkNoShowAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (entry.Status is EntryStatuses.Withdrawn or EntryStatuses.Disqualified or EntryStatuses.Rejected)
        {
            return Outcome.Conflict(
                "اللاعب منسحب أو مستبعد بالفعل.",
                "The athlete is already withdrawn or disqualified.");
        }

        if (await LockedAsync(entry, cancellationToken) is { } locked) return locked;

        if (entry.CheckedInAt is not null)
        {
            return Outcome.Conflict(
                "يُسجَّل الغياب عند تسجيل الحضور فقط؛ هذا اللاعب سجّل حضوره.",
                "No Show is recorded at Check-in only; this athlete has already checked in.");
        }

        var previous = entry.WeighInResult;
        var atCheckIn = entry.CheckedInAt is null;
        entry.Status = EntryStatuses.Disqualified;
        entry.StatusReason = atCheckIn ? NoShowAtCheckInReason : NoShowReason;
        entry.WeighInResult = ReadinessResults.NoShow;
        entry.WeighInAt = DateTime.UtcNow;
        entry.WeighInBy = actor.Username;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.WeighInRecorded, "tournament_entry", entry.Id,
            fromStatus: previous ?? entry.Status, toStatus: EntryStatuses.Disqualified,
            details: atCheckIn ? "No show at check-in (DSQ, T05)." : "No show at the weigh-in (DSQ, T05).");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// The DSQ code is kept in the status reason: the entry has no field of
    /// its own for a disqualification code.
    /// </summary>
    public const string NoShowReason = "T05 — No show at the weigh-in (DSQ).";
    public const string NoShowAtCheckInReason = "T05 — No show at check-in (DSQ).";

    /// <summary>
    /// Readiness stops being editable here once the athlete is approved for
    /// the draw, or they are in their division's published draw — the published
    /// structure is changed from the draw, not underneath it. An athlete who
    /// joined after the draw was published (a late entrant, not in the bracket)
    /// completes the normal readiness steps; the published draw is not touched.
    /// </summary>
    private async Task<Outcome?> LockedAsync(TournamentEntry entry, CancellationToken cancellationToken)
    {
        if (entry.Status == EntryStatuses.Rejected)
        {
            return Outcome.Conflict(
                "رُفضت جاهزية اللاعب للقرعة؛ لا يمكن تعديلها هنا.",
                "The athlete's readiness was rejected for the draw; it can no longer be changed here.");
        }

        if (entry.QualifiedAt is not null)
        {
            return Outcome.Conflict(
                "تم اعتماد اللاعب للقرعة؛ لا يمكن تعديل الجاهزية.",
                "The athlete is approved for the draw; readiness can no longer be changed here.");
        }

        if (await InPublishedDrawAsync(db, entry, cancellationToken))
        {
            return Outcome.Conflict(
                "صدرت قرعة فئة اللاعب؛ لا يمكن تعديل الجاهزية.",
                "The athlete's division has a published draw; readiness can no longer be changed here.");
        }

        return null;
    }

    /// <summary>
    /// The entry's status after a readiness result changes: a Failed
    /// examination or weigh-in makes it not eligible; correcting that back
    /// returns it to checked in. Withdrawn and disqualified are left alone.
    /// </summary>
    private static void Restate(TournamentEntry entry, string? failureReason)
    {
        if (entry.Status is EntryStatuses.Withdrawn or EntryStatuses.Disqualified or EntryStatuses.Rejected) return;

        var failed = entry.MedicalResult == ReadinessResults.Failed
                     || entry.WeighInResult == ReadinessResults.Failed;

        if (failed)
        {
            entry.Status = EntryStatuses.NotEligible;
            entry.StatusReason = failureReason ?? entry.StatusReason;
        }
        else if (entry.Status == EntryStatuses.NotEligible)
        {
            entry.Status = entry.CheckedInAt is null ? EntryStatuses.Registered : EntryStatuses.CheckedIn;
            entry.StatusReason = null;
        }
    }

    /// <summary>
    /// Whether moving this entry to another class or category clears something
    /// given for the class it is in now: a Passed or Failed weigh-in, or Final
    /// Draw Approval. A No Show is a disqualification, not a judgement of the
    /// class, and is left as it is.
    /// </summary>
    public static bool ClassChangeClears(TournamentEntry entry) =>
        entry.WeighInResult is ReadinessResults.Passed or ReadinessResults.Failed
        || entry.QualifiedAt is not null;

    /// <summary>
    /// SMTF weigh-in policy §7 — a weigh-in result and a Final Draw Approval
    /// belong to the class they were given for. Before an entry changes class
    /// or category (Participants edit, technical amendment), they are cleared
    /// — never carried over, never silently: the change needs a reason, and
    /// what was cleared is written into the change's own audit line. The
    /// measured weight is kept (it is a fact of the scales), so the weigh-in
    /// can be recorded again for the new class. Call it before the entry's
    /// division changes; it does not save.
    /// </summary>
    /// <returns>A refusal, or the sentence the caller appends to its audit line ("" when nothing was cleared).</returns>
    private async Task<(Outcome? Refused, string Cleared)> ClearForClassChangeAsync(
        TournamentEntry entry, string? reason, CancellationToken cancellationToken)
    {
        if (!ClassChangeClears(entry)) return (null, "");

        if (string.IsNullOrWhiteSpace(reason))
        {
            return (Outcome.Invalid(
                "لهذه المشاركة نتيجة وزن أو اعتماد نهائي للقرعة في فئتها الحالية؛ تغيير الفئة يلغيهما. اذكر سبب التغيير.",
                "This entry has a weigh-in result or Final Draw Approval for its current class. Changing the "
                + "class clears them (the measured weight is kept): enter a reason for the change."), "");
        }
        if (reason.Trim().Length > 500)
            return (Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters."), "");

        var cleared = new List<string>();
        if (entry.WeighInResult is ReadinessResults.Passed or ReadinessResults.Failed)
        {
            var weight = entry.ActualWeightKg is { } kg ? $"{WeighInWeights.Kg(kg)} kg, kept as measured" : "no weight";
            cleared.Add($"weigh-in {entry.WeighInResult} ({weight}; recorded {entry.WeighInAt:yyyy-MM-dd HH:mm} UTC by {entry.WeighInBy})");
            entry.WeighInResult = null;
            entry.WeighInAt = null;
            entry.WeighInBy = null;
        }
        if (entry.QualifiedAt is not null)
        {
            cleared.Add($"Final Draw Approval (given {entry.QualifiedAt:yyyy-MM-dd HH:mm} UTC by {entry.QualifiedBy})");
            entry.QualifiedAt = null;
            entry.QualifiedBy = null;
            if (entry.Status == EntryStatuses.Qualified) entry.Status = EntryStatuses.CheckedIn;
        }
        // A cleared Failed lifts the Not Eligible it brought (unless the examination failed too).
        Restate(entry, null);

        // In a draw that is made but not published: the draw is not touched;
        // Draw Preparation compares it with who is eligible and flags it.
        var inDraw = entry.DivisionId is { } from && await db.Bouts.AnyAsync(
            b => b.DivisionId == from && (b.RedEntryId == entry.Id || b.BlueEntryId == entry.Id), cancellationToken);

        return (null, $" Cleared for the new class: {string.Join("; ", cleared)}. Reason: {reason.Trim()}."
                      + (inDraw ? " The previous division's draw includes the athlete; Draw Preparation flags it for review." : ""));
    }

    /// <summary>
    /// A measured weight as the weigh-in takes it: in kilograms, above 0 and up
    /// to 300, with at most two decimal places. A weight with more is refused,
    /// never rounded into shape.
    /// </summary>
    private static Outcome? WeightInvalid(decimal weightKg)
    {
        if (weightKg is <= 0 or > 300)
            return Outcome.Invalid("أدخل الوزن الفعلي بالكيلوجرام.", "Enter the actual weight in kilograms.");
        if (!WeighInWeights.HasValidPrecision(weightKg))
        {
            return Outcome.Invalid(
                "أدخل الوزن بخانتين عشريتين على الأكثر (مثال: 32.25).",
                $"Enter the actual weight with at most two decimal places (for example 32.25); {WeighInWeights.Kg(weightKg)} kg has more.");
        }
        return null;
    }

    /// <summary>The same check for the preview route, which reports it before anything is recorded.</summary>
    public static Outcome? PreviewWeightInvalid(decimal weightKg) => WeightInvalid(weightKg);

    private static string? Join(params string?[] parts)
    {
        var present = parts.Where(p => !string.IsNullOrWhiteSpace(p)).ToList();
        return present.Count == 0 ? null : string.Join(" · ", present);
    }
    /// <summary>
    /// REQ-09 rule 7 — the readiness approver's decision, which is what puts
    /// an athlete into the pool the draw is made from. Nothing else does.
    ///
    /// A decision can be changed until the division's draw is published:
    /// Rejected to Approved needs a reason for the correction; every
    /// readiness condition is checked again either way.
    /// </summary>
    public async Task<Outcome> ApproveReadinessAsync(
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        string? correctionReason = null)
    {
        if (DecisionBlocked(entry) is { } blocked) return blocked;

        if (entry.QualifiedAt is not null)
            return Outcome.Conflict("تم اعتماد اللاعب مسبقًا.", "The athlete is already approved for the draw.");

        // Approval rests on a weigh-in that holds for the class the athlete is
        // in now, by today's rule — not on a Passed given for another class.
        // (Only approving checks this: rejecting stays possible, so an
        // approval that no longer holds can always be withdrawn.)
        var current = await db.TournamentDivisions.AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == entry.DivisionId, cancellationToken);
        if (DrawEligibility.StaleWeighIn(entry, current) is { } stale)
        {
            return Outcome.Conflict(
                "الوزن المسجل لا يطابق فئة اللاعب الحالية؛ سجّل الوزن لهذه الفئة قبل الاعتماد.",
                $"The weigh-in does not hold for the athlete's current class: {stale}. "
                + "Record the weigh-in for this class before approving.");
        }

        var wasRejected = entry.Status == EntryStatuses.Rejected;
        if (wasRejected && string.IsNullOrWhiteSpace(correctionReason))
        {
            return Outcome.Invalid(
                "تغيير قرار الرفض يتطلب ذكر سبب التصحيح.",
                "Changing a Rejected decision requires a reason for the correction.");
        }
        if (correctionReason is { Length: > 500 })
            return Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters.");

        if (await DrawPublishedAsync(entry, cancellationToken) is { } published) return published;

        var replaced = wasRejected
            ? $"Replaces Rejected ({entry.ReadinessRejectedAt:yyyy-MM-dd HH:mm} UTC by {entry.ReadinessRejectedBy}: "
              + $"{entry.ReadinessRejectionReason})."
            : null;

        entry.Status = EntryStatuses.Qualified;
        entry.QualifiedAt = DateTime.UtcNow;
        entry.QualifiedBy = actor.Username;
        entry.ReadinessRejectedAt = null;
        entry.ReadinessRejectedBy = null;
        entry.ReadinessRejectionReason = null;
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.ReadinessApproved, "tournament_entry", entry.Id,
            fromStatus: wasRejected ? EntryStatuses.Rejected : null, toStatus: EntryStatuses.Qualified,
            details: wasRejected ? $"Correction: {correctionReason!.Trim()} {replaced}" : null);
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// The approver's refusal: all three steps passed, but the athlete is not
    /// released to the draw. Needs a reason, recorded with who and when. An
    /// approval can be changed to Rejected until the draw is published; the
    /// rejection reason is then also the explanation of the change.
    /// </summary>
    public async Task<(Outcome Result, bool InUnpublishedDraw)> RejectReadinessAsync(
        TournamentEntry entry,
        string? reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(reason))
            return (Outcome.Invalid("اذكر سبب الرفض.", "Enter the reason for rejection."), false);
        if (reason.Trim().Length > 500)
            return (Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters."), false);

        if (DecisionBlocked(entry) is { } blocked) return (blocked, false);

        if (entry.Status == EntryStatuses.Rejected)
            return (Outcome.Conflict("تم رفض اللاعب مسبقًا.", "The athlete is already rejected for the draw."), false);

        if (await DrawPublishedAsync(entry, cancellationToken) is { } published) return (published, false);

        var wasApproved = entry.QualifiedAt is not null;
        var replaced = wasApproved
            ? $" Replaces Approved ({entry.QualifiedAt:yyyy-MM-dd HH:mm} UTC by {entry.QualifiedBy})."
            : null;

        // Placed in a draw that is made but not published: it has to be
        // redrawn, which takes only approved athletes.
        var inDraw = wasApproved && await db.Bouts.AnyAsync(
            b => b.DivisionId == entry.DivisionId && (b.RedEntryId == entry.Id || b.BlueEntryId == entry.Id),
            cancellationToken);

        entry.Status = EntryStatuses.Rejected;
        entry.QualifiedAt = null;
        entry.QualifiedBy = null;
        entry.ReadinessRejectedAt = DateTime.UtcNow;
        entry.ReadinessRejectedBy = actor.Username;
        entry.ReadinessRejectionReason = reason.Trim();
        entry.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.ReadinessRejected, "tournament_entry", entry.Id,
            fromStatus: wasApproved ? EntryStatuses.Qualified : null, toStatus: EntryStatuses.Rejected,
            details: $"Reason for rejection: {entry.ReadinessRejectionReason}{replaced}"
                     + (inDraw ? " The division's unpublished draw includes the athlete and must be redrawn." : ""));
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), inDraw);
    }

    /// <summary>What has to hold for any draw-readiness decision, first or changed.</summary>
    private static Outcome? DecisionBlocked(TournamentEntry entry)
    {
        if (entry.CheckedInAt is null
            || entry.MedicalResult != ReadinessResults.Passed
            || entry.WeighInResult != ReadinessResults.Passed)
        {
            return Outcome.Conflict(
                "لا يمكن البت في الجاهزية قبل اجتياز الحضور والفحص الطبي والوزن.",
                "Check-in, the medical examination and the weigh-in all have to be passed first.");
        }

        if (entry.DivisionId is null)
        {
            return Outcome.Conflict(
                "لا يمكن الاعتماد بدون فئة وزن.",
                "The athlete needs a weight class before a decision can be made.");
        }

        if (entry.Status is EntryStatuses.Disqualified or EntryStatuses.Withdrawn or EntryStatuses.NotEligible)
            return Outcome.Conflict("حالة اللاعب لا تسمح بذلك.", "The athlete's status does not allow this.");

        return null;
    }

    private async Task<Outcome?> DrawPublishedAsync(TournamentEntry entry, CancellationToken cancellationToken) =>
        await InPublishedDrawAsync(db, entry, cancellationToken)
            ? Outcome.Conflict(
                "صدرت قرعة فئة اللاعب؛ لا يمكن تغيير القرار.",
                "The division's draw is published; the decision can no longer be changed.")
            : null;

    /// <summary>
    /// Whether the entry is in its division's PUBLISHED bracket (it holds a corner, or won, in one of the division's
    /// bouts). An entry of a published division that is not in the bracket — a late entrant — is not.
    /// </summary>
    public static async Task<bool> InPublishedDrawAsync(SmfDbContext db, TournamentEntry entry, CancellationToken cancellationToken)
    {
        if (entry.DivisionId is not { } id) return false;
        var publishedAt = await db.TournamentDivisions.AsNoTracking()
            .Where(d => d.Id == id).Select(d => d.DrawPublishedAt).FirstOrDefaultAsync(cancellationToken);
        if (publishedAt is null) return false;
        if (!await db.Bouts.AnyAsync(b => b.DivisionId == id
                && (b.RedEntryId == entry.Id || b.BlueEntryId == entry.Id || b.WinnerEntryId == entry.Id), cancellationToken))
            return false;
        if (entry.QualifiedAt is not null) return true;
        // One exception: an athlete TRANSFERRED into this division after its draw was published (a class change, which
        // cleared their approval) who is still listed in the bracket from before — e.g. moved out and back again. They
        // complete the normal weigh-in for the class; once approved again, the protection above applies again.
        return !await TransferredSinceAsync(db, entry.Id, publishedAt.Value, cancellationToken);
    }

    /// <summary>A division change of the entry (Participants edit or weigh-in move) recorded at or after <paramref name="since"/>.</summary>
    public static Task<bool> TransferredSinceAsync(SmfDbContext db, int entryId, DateTime since, CancellationToken cancellationToken) =>
        db.AuditLog.AsNoTracking().AnyAsync(a => a.EntityType == "tournament_entry" && a.EntityId == entryId
            && a.Action == AuditActions.EntryUpdated && a.CreatedAt >= since
            && a.FromStatus != null && a.ToStatus != null && a.FromStatus != a.ToStatus, cancellationToken);

    /// <summary>
    /// Whether a measured weight makes a division's class at the weigh-in, by
    /// <see cref="WeighInRange"/>: the first class from its limit − 2 kg, every
    /// later class above the preceding official limit, each up to and
    /// including its own limit; the open class above the preceding limit.
    /// (This replaced the "+0.5 kg" rule, which itself replaced a ±0.5 kg
    /// tolerance.)
    /// </summary>
    public static bool Fits(TournamentDivision division, decimal weightKg) =>
        WeighInRange.For(division).Check(weightKg) == WeighInVerdict.Matches;

    /// <summary>"accepted 32.01–34 kg", "accepted over 91 kg", for messages.</summary>
    private static string Accepted(WeighInRange range) =>
        range.Resolved ? $"accepted {range.Text()}" : "range not configured";
}
