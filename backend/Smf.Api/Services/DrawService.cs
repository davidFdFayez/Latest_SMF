using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// Making, publishing and amending a draw — Phase 3 REQ-10.
///
/// <see cref="DrawBuilder"/> decides the shape; this writes it down, publishes
/// it, and handles what happens afterwards. The two are kept apart because the
/// shape is the part worth testing exhaustively and it should not need a
/// database to do it.
///
/// Rule 6 is the one that shapes this class: the technical delegate may redraw
/// or amend a published draw without anybody else's approval, but a reason is
/// compulsory and every change is logged. So there is no "edit" that bypasses
/// the audit trail.
/// </summary>
public class DrawService(SmfDbContext db, AuditLogger audit, RegistrationAttachmentStore attachments)
{
    /// <summary>
    /// Whether a bout has actually started. The system records no start event or bout status yet (the results
    /// module is not built), so a bout counts as started only when an outcome is recorded: a result (its winner)
    /// or a walkover. A scheduled start time that has passed does NOT make it started. When a real start event
    /// exists, add it here — this is the single rule regeneration relies on.
    /// </summary>
    public static bool BoutStarted(Bout b) => b.IsWalkover || (!b.IsBye && b.WinnerEntryId is not null);

    /* ── published versions (DrawPublication) ──────────────────────────────── */

    /// <summary>The division's current published version, if any (the one the website shows while an update is a Draft).</summary>
    public Task<DrawPublication?> CurrentPublicationAsync(int divisionId, CancellationToken cancellationToken = default) =>
        db.DrawPublications.AsNoTracking()
            .Where(p => p.DivisionId == divisionId && p.SupersededAt == null)
            .OrderByDescending(p => p.Version)
            .FirstOrDefaultAsync(cancellationToken);

    /// <summary>
    /// Records <paramref name="bouts"/> — the division's draw as published — as a new version with a frozen copy of the
    /// public bracket, and marks any earlier current version superseded (never deleted). Called inside the caller's
    /// transaction, before it saves.
    /// </summary>
    private async Task<DrawPublication> RecordPublicationAsync(TournamentDivision division, IReadOnlyCollection<Bout> bouts,
        DateTime publishedAt, string publishedBy, string? note, CancellationToken cancellationToken)
    {
        var projection = await PublicDraw.ProjectAsync(db, division, attachments, cancellationToken);
        var slots = new Dictionary<string, int>();
        foreach (var b in bouts)
        {
            if (b.RedEntryId is { } red) slots[$"{b.Round}:{b.Position}:red"] = red;
            if (b.BlueEntryId is { } blue) slots[$"{b.Round}:{b.Position}:blue"] = blue;
        }
        var now = DateTime.UtcNow;
        foreach (var previous in await db.DrawPublications
                     .Where(p => p.DivisionId == division.Id && p.SupersededAt == null).ToListAsync(cancellationToken))
        {
            previous.SupersededAt = now;
            previous.SupersededBy = publishedBy;
        }
        var version = (await db.DrawPublications.Where(p => p.DivisionId == division.Id)
            .MaxAsync(p => (int?)p.Version, cancellationToken) ?? 0) + 1;
        var row = new DrawPublication
        {
            TournamentId = division.TournamentId,
            DivisionId = division.Id,
            Version = version,
            PublishedAt = publishedAt,
            PublishedBy = publishedBy,
            Athletes = DrawEntryIdsOf(bouts.ToList()).Count,
            // The same settings ASP.NET Core uses for HTTP responses, so the website receives the same bytes it did.
            SnapshotJson = System.Text.Json.JsonSerializer.Serialize(projection,
                new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web)
                {
                    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
                }),
            SlotsJson = System.Text.Json.JsonSerializer.Serialize(slots),
            Note = note,
        };
        db.DrawPublications.Add(row);
        return row;
    }

    /* ── shared safeguards (DRW-002/003/004/005 remediation) ────────────────
       Every operation that changes a stored draw runs under SQLite's write
       lock (BEGIN IMMEDIATE) in one transaction, reloads what it checks inside
       that lock, refuses when the draw is protected, checks the result with
       DrawIntegrity before anything is committed, and writes its audit line in
       the same commit. A refusal or a failure at any stage leaves the draw,
       the entries and the audit log exactly as they were. */

    /// <summary>Why a redraw, an amendment or a withdrawal was refused, for the page to act on.</summary>
    public static class DrawRefusals
    {
        public const string PublishedNeedsDelegate = "published_requires_delegate";
        public const string ScheduleApproved = "schedule_approved";
        public const string HasResults = "has_results";
        public const string HasWalkovers = "has_walkovers";
        public const string ScheduledResize = "scheduled_resize";
        public const string RoundLocked = "round_locked";
        public const string UseWithdrawal = "use_withdrawal";
        public const string NotInDraw = "not_in_draw";
        public const string WouldBreakByes = "would_break_byes";
        public const string NoChange = "no_change";
        public const string NotEnough = "not_enough_athletes";
        public const string Integrity = "integrity";
    }

    /// <summary>The outcome of a draw change: the refusal code, and for a redraw what it produced.</summary>
    public sealed record DrawChange(Outcome Result, string? Refusal = null, int Bouts = 0, string? Status = null, string? Schedule = null);

    private static DrawChange Refused(string code, string ar, string en, int status = 409) =>
        new(new Outcome(false, status, ar, en), code);

    /// <summary>Opens the write-locked transaction, unless the caller already holds one (the withdrawal endpoint).</summary>
    private async Task<IDbContextTransaction?> BeginAsync(CancellationToken cancellationToken) =>
        db.Database.CurrentTransaction is null ? await EmailReservations.BeginExclusiveAsync(db, cancellationToken) : null;

    private static bool HasSlot(Bout b) =>
        b.BoutNumber is not null || b.RingId is not null || b.StartTime is not null || b.ScheduledDate is not null || b.OrderInRing is not null;

    /// <summary>
    /// The one protection rule (D3/D4): a draw under an approved schedule (the
    /// division is published or holds schedule slots), a draw with a recorded
    /// result, and a draw with a walkover cannot be redrawn or structurally
    /// edited. Null when the change may proceed.
    /// </summary>
    private static DrawChange? Protect(Tournament tournament, TournamentDivision division, IReadOnlyCollection<Bout> bouts)
    {
        if (bouts.Count == 0) return null;
        if (tournament.ScheduleApprovedAt is not null && (division.DrawPublishedAt is not null || bouts.Any(HasSlot)))
            return Refused(ScheduleService.ApprovedCode,
                "جدول النزالات معتمد؛ لا يمكن تعديل القرعة أو إعادة إجرائها قبل سحب اعتماد الجدول من قبل المعتمِد مع ذكر السبب.",
                "The bout schedule is approved, so this draw cannot be redrawn or edited. A schedule approver must first withdraw the approval, with a reason.");
        if (bouts.Any(b => b.WinnerEntryId is not null && !b.IsWalkover))
            return Refused(DrawRefusals.HasResults,
                "توجد نتائج مسجلة في هذه الفئة؛ لا يمكن تعديل القرعة أو إعادة إجرائها.",
                "Results are recorded in this division. The draw cannot be redrawn or edited, because that would invalidate them.");
        if (bouts.Any(b => b.IsWalkover))
            return Refused(DrawRefusals.HasWalkovers,
                "تتضمن القرعة فوزًا بالانسحاب؛ لا يمكن إعادة إجرائها أو تعديلها، ويبقى الفوز بالانسحاب قائمًا.",
                "This draw contains a walkover from a withdrawal. It cannot be redrawn or edited; the walkover stands.");
        return null;
    }

    private static DrawChange? DelegateOnly(TournamentDivision division, bool hasDraw, AdminIdentity.Actor actor) =>
        hasDraw && division.DrawPublishedAt is not null && !actor.Has(AdminPermissions.TournamentDrawApprove)
            ? Refused(DrawRefusals.PublishedNeedsDelegate,
                "القرعة منشورة؛ تعديلها أو إعادة إجرائها من صلاحية المندوب الفني (اعتماد القرعة).",
                $"This draw is published. Only the Technical Delegate (the '{AdminPermissions.TournamentDrawApprove}' permission) may redraw or amend it.",
                403)
            : null;

    private static DrawIntegrity.Row RowOf(Bout b) => new(
        b.Id, b.Round, b.Position, b.RedEntryId, b.BlueEntryId, b.IsBye, b.IsWalkover, b.WinnerEntryId, b.WinnerToBoutId, b.WinnerToCorner);

    private static DrawChange IntegrityRefusal(IReadOnlyList<string> problems) => Refused(DrawRefusals.Integrity,
        "هذا التغيير يخل بسلامة القرعة؛ لم يُحفظ شيء.",
        "This change would break the draw, so nothing was saved: " + string.Join("; ", problems.Take(5)) + ".");

    /// <summary>
    /// Draws a division from its qualified athletes, or redraws it (REQ-10 rule 6).
    ///
    /// Remediation (DRW-002, DRW-005, DRW-007): a published draw is redrawn
    /// only by the Technical Delegate with a reason and stays published; a draw
    /// under an approved schedule, with a result or with a walkover is never
    /// redrawn; when the field size is unchanged the bracket shape is identical,
    /// so the existing bout rows are updated in place and keep their identity,
    /// links and schedule slots (every slotted bout whose athletes change is
    /// named in the audit line); a redraw that would change the shape of a
    /// scheduled draw is refused rather than deleting scheduled bouts.
    /// </summary>
    /// <param name="seed">
    /// Supplied so a draw can be reproduced in a dispute. Omitted means a new
    /// random one, which is recorded in the audit entry with the algorithm version.
    /// </param>
    public async Task<DrawChange> CreateAsync(
        TournamentDivision division,
        AdminIdentity.Actor actor,
        int? seed,
        string? reason,
        CancellationToken cancellationToken = default)
    {
        var why = string.IsNullOrWhiteSpace(reason) ? null : reason.Trim();
        if (why is { Length: > 500 })
            return new DrawChange(Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters."));

        await using var transaction = await BeginAsync(cancellationToken);
        await db.Entry(division).ReloadAsync(cancellationToken);

        var existing = await db.Bouts
            .Where(b => b.DivisionId == division.Id)
            .ToListAsync(cancellationToken);
        var wasPublished = existing.Count > 0 && division.DrawPublishedAt is not null;

        if (DelegateOnly(division, existing.Count > 0, actor) is { } notDelegate) return notDelegate;
        if (wasPublished && why is null)
        {
            return new DrawChange(Outcome.Invalid(
                "إعادة القرعة بعد النشر تتطلب ذكر السبب.",
                "Redrawing a published draw requires a reason."));
        }

        var tournament = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == division.TournamentId, cancellationToken);
        if (Protect(tournament, division, existing) is { } protectedDraw) return protectedDraw;

        // REQ-10 rule 1 — the qualified pool, and nobody else; one club identity (DRW-007).
        var pool = (await db.TournamentEntries.AsNoTracking()
                .Where(e => e.DivisionId == division.Id && e.Status == EntryStatuses.Qualified)
                .ToListAsync(cancellationToken))
            .Where(e => DrawEligibility.Eligible(e, division))
            .Select(e => new DrawBuilder.Contender(e.Id, DrawClub.Of(e)))
            .ToList();

        if (pool.Count < 2)
        {
            return Refused(DrawRefusals.NotEnough,
                "لا توجد أعداد كافية من اللاعبين المؤهلين لإنشاء قرعة.",
                "There are not enough qualified athletes to make a draw.");
        }

        var chosenSeed = seed ?? Random.Shared.Next();
        var draw = DrawBuilder.Build(pool, chosenSeed);
        var poolIds = pool.Select(c => c.EntryId).ToList();

        var slotted = existing.Where(HasSlot).ToList();
        var inPlace = existing.Count > 0 && SameShape(existing, draw);
        string? scheduleNote = null;

        if (inPlace)
        {
            var byeChanged = draw.Bouts.Any(p => existing.Single(b => b.Round == p.Round && b.Position == p.Position).IsBye != p.IsBye);
            if (slotted.Count > 0 && byeChanged) return ScheduledResize();

            var renamed = new List<string>();
            foreach (var planned in draw.Bouts)
            {
                var bout = existing.Single(b => b.Round == planned.Round && b.Position == planned.Position);
                if (HasSlot(bout) && (bout.RedEntryId != planned.RedEntryId || bout.BlueEntryId != planned.BlueEntryId))
                {
                    renamed.Add($"#{bout.BoutNumber?.ToString() ?? "-"} (bout {bout.Id}): "
                                + $"{bout.RedEntryId?.ToString() ?? "-"} v {bout.BlueEntryId?.ToString() ?? "-"} -> "
                                + $"{planned.RedEntryId?.ToString() ?? "-"} v {planned.BlueEntryId?.ToString() ?? "-"}");
                }
                bout.RedEntryId = planned.RedEntryId;
                bout.BlueEntryId = planned.BlueEntryId;
                bout.IsBye = planned.IsBye;
            }
            if (slotted.Count > 0)
            {
                scheduleNote = $"Schedule slots kept: {slotted.Count} scheduled bout(s) keep their number, ring and time; "
                               + $"athletes changed in {renamed.Count}: {(renamed.Count == 0 ? "none" : string.Join("; ", renamed))}. "
                               + "Re-check the schedule (clashes) before approving it.";
            }
        }
        else
        {
            if (slotted.Count > 0) return ScheduledResize();

            // A redraw of a different size replaces the bouts; they are owned by
            // the division and carry nothing (no slot, result or walkover — checked above).
            db.Bouts.RemoveRange(existing);
            await db.SaveChangesAsync(cancellationToken);
            await WriteAsync(division, draw, cancellationToken);
        }

        // A first draw is a Draft; a redraw keeps the publication state it found (DRW-002).
        if (existing.Count == 0) division.DrawPublishedAt = null;
        await db.SaveChangesAsync(cancellationToken);

        var stored = await db.Bouts.Where(b => b.DivisionId == division.Id).ToListAsync(cancellationToken);
        var problems = DrawIntegrity.Check(stored.Select(RowOf).ToList(), poolIds);
        if (problems.Count > 0)
        {
            if (transaction is null) throw new InvalidOperationException("Draw integrity: " + string.Join("; ", problems));
            return IntegrityRefusal(problems);
        }

        var status = division.DrawPublishedAt is null ? "draft" : "published";
        audit.Write(actor,
            existing.Count > 0 ? AuditActions.DrawAmended : AuditActions.DrawCreated,
            "tournament_division", division.Id,
            division.Describe(arabic: false),
            fromStatus: existing.Count == 0 ? null : wasPublished ? "published" : "draft",
            toStatus: status,
            details: $"{pool.Count} athletes, {draw.ByeCount} bye(s), seed {chosenSeed}, algorithm {DrawBuilder.AlgorithmVersion}."
                     + (wasPublished ? " Redrawn after publication by the Technical Delegate; the draw remains published." : string.Empty)
                     + (existing.Count == 0 ? string.Empty
                         : inPlace ? $" {existing.Count} bout row(s) updated in place." : $" {existing.Count} bout row(s) replaced.")
                     + (scheduleNote is null ? string.Empty : " " + scheduleNote)
                     + (why is null ? string.Empty : $" Reason: {why}"));

        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return new DrawChange(Outcome.Success(), null, draw.Bouts.Count, status, scheduleNote is null ? "none" : "kept");

        static DrawChange ScheduledResize() => Refused(DrawRefusals.ScheduledResize,
            "مباريات هذه الفئة مجدولة؛ إعادة القرعة بعدد مختلف من اللاعبين ستحذف مباريات مجدولة، لذلك رُفضت.",
            "This division's bouts are scheduled. A redraw that changes the bracket would delete scheduled bouts and their numbers, so it is refused.");
    }

    /// <summary>
    /// Whether a stored draw and a built one have the same rows and links —
    /// true whenever the bracket size is the same, so a redraw can update the
    /// existing rows in place.
    /// </summary>
    private static bool SameShape(IReadOnlyCollection<Bout> existing, DrawBuilder.Draw draw)
    {
        if (existing.Count != draw.Bouts.Count) return false;
        var byPosition = existing.ToDictionary(b => (b.Round, b.Position));
        foreach (var planned in draw.Bouts)
        {
            if (!byPosition.TryGetValue((planned.Round, planned.Position), out var bout)) return false;
            if (planned.WinnerToPosition is not { } nextPosition)
            {
                if (bout.WinnerToBoutId is not null) return false;
                continue;
            }
            if (!byPosition.TryGetValue((planned.Round + 1, nextPosition), out var next)) return false;
            if (bout.WinnerToBoutId != next.Id || bout.WinnerToCorner != planned.WinnerToCorner) return false;
        }
        return true;
    }

    /// <summary>
    /// Writes a built draw as the division's bouts and links each to the slot
    /// its winner takes above it. Shared by <see cref="CreateAsync"/> and
    /// <see cref="GenerateDraftAsync"/>, so both store exactly the same shape.
    /// </summary>
    private async Task WriteAsync(TournamentDivision division, DrawBuilder.Draw draw, CancellationToken cancellationToken)
    {
        var created = new Dictionary<(int Round, int Position), Bout>();

        foreach (var planned in draw.Bouts.OrderBy(b => b.Round).ThenBy(b => b.Position))
        {
            var bout = new Bout
            {
                TournamentId = division.TournamentId,
                DivisionId = division.Id,
                Round = planned.Round,
                Position = planned.Position,
                RedEntryId = planned.RedEntryId,
                BlueEntryId = planned.BlueEntryId,
                IsBye = planned.IsBye,
            };

            db.Bouts.Add(bout);
            created[(planned.Round, planned.Position)] = bout;
        }

        await db.SaveChangesAsync(cancellationToken);

        // Now that every bout has an id, point each at the one above it.
        foreach (var planned in draw.Bouts)
        {
            if (planned.WinnerToPosition is not { } nextPosition) continue;
            if (!created.TryGetValue((planned.Round, planned.Position), out var bout)) continue;
            if (!created.TryGetValue((planned.Round + 1, nextPosition), out var next)) continue;

            bout.WinnerToBoutId = next.Id;
            bout.WinnerToCorner = planned.WinnerToCorner;
        }
    }

    /// <summary>Why a Draw Management generation was refused, for the page to act on.</summary>
    public static class GenerateRefusals
    {
        public const string ExistingDraw = "existing_draw";
        public const string NotEnough = "not_enough_athletes";
        public const string OverCapacity = "over_capacity";
        public const string Stale = "stale_athletes";
    }

    /// <summary>
    /// Draw Management, Phase 3: generates a division's draw as a Draft from
    /// its Final-Draw-Approved athletes — with the same <see cref="DrawBuilder"/>
    /// and the same stored shape as every other draw, so there is one bracket
    /// per division and one source of truth.
    ///
    /// Unlike <see cref="CreateAsync"/> it never replaces anything: a division
    /// that already has a draw (draft or published) is refused. The athletes
    /// must be exactly those the administrator was shown
    /// (<paramref name="expectedEntryIds"/>); if the pool has changed since,
    /// it is refused as stale rather than drawn from a list nobody saw.
    /// The check and the write run under SQLite's write lock, so two requests
    /// at once cannot both create a draw. Nothing is approved, published or
    /// scheduled. <paramref name="dryRun"/> runs every check and writes nothing.
    /// </summary>
    public async Task<(Outcome Result, string? Refusal, DrawBuilder.Draw? Draw, int? Seed)> GenerateDraftAsync(
        TournamentDivision division,
        IReadOnlyCollection<int> expectedEntryIds,
        bool dryRun,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = dryRun ? null : await EmailReservations.BeginExclusiveAsync(db, cancellationToken);

        if (await db.Bouts.AnyAsync(b => b.DivisionId == division.Id, cancellationToken))
        {
            return (Outcome.Conflict(
                "توجد قرعة لهذه الفئة بالفعل، ولا يمكن استبدالها من هنا.",
                "This division already has a draw. It cannot be replaced from here."), GenerateRefusals.ExistingDraw, null, null);
        }

        // The pool: exactly the eligible athletes (DrawEligibility: Final Draw
        // Approval on a weigh-in that holds for this class).
        var pool = (await db.TournamentEntries.AsNoTracking()
                .Where(e => e.DivisionId == division.Id && e.Status == EntryStatuses.Qualified)
                .ToListAsync(cancellationToken))
            .Where(e => DrawEligibility.Eligible(e, division))
            // The club as the preparation page shows it (club, else training centre).
            .Select(e => new DrawBuilder.Contender(e.Id, DrawClub.Of(e)))
            .ToList();

        var plan = DrawMath.For(pool.Count);
        if (plan.Kind is DrawMath.Kind.NoEligibleAthletes or DrawMath.Kind.NoContest)
        {
            return (Outcome.Conflict(
                "يلزم لاعبان مؤهلان على الأقل لإجراء القرعة.",
                "At least two athletes with Final Draw Approval are needed to generate a draw."), GenerateRefusals.NotEnough, null, null);
        }
        if (plan.Kind == DrawMath.Kind.OverCapacity)
        {
            return (Outcome.Conflict(
                $"عدد اللاعبين ({pool.Count}) يتجاوز الحد المعتمد ({DrawMath.MaxAthletes}).",
                $"{pool.Count} athletes is more than the {DrawMath.MaxAthletes} the current competition rules provide for."), GenerateRefusals.OverCapacity, null, null);
        }

        var expected = expectedEntryIds.ToHashSet();
        if (!expected.SetEquals(pool.Select(c => c.EntryId)))
        {
            return (Outcome.Conflict(
                "تغيرت قائمة اللاعبين المعتمدين منذ عرضها. يرجى مراجعة القائمة قبل إجراء القرعة.",
                "The approved athletes have changed since this page was loaded. Review the list before generating the draw."), GenerateRefusals.Stale, null, null);
        }

        if (dryRun) return (Outcome.Success(), null, null, null);

        var seed = Random.Shared.Next();
        var draw = DrawBuilder.Build(pool, seed);
        await WriteAsync(division, draw, cancellationToken);
        division.DrawPublishedAt = null;

        audit.Write(actor, AuditActions.DrawCreated, "tournament_division", division.Id,
            division.Describe(arabic: false),
            details: $"Generated as a Draft in Draw Management: {pool.Count} athletes, {draw.ByeCount} bye(s), "
                     + $"{pool.Count - 1} bouts, seed {seed}, algorithm {DrawBuilder.AlgorithmVersion}.");
        await db.SaveChangesAsync(cancellationToken);
        await transaction!.CommitAsync(cancellationToken);
        return (Outcome.Success(), null, draw, seed);
    }

    /// <summary>One athlete on either side of a draw/eligibility comparison.</summary>
    public sealed record SyncAthlete(int EntryId, string? NameEn, string? NameAr, string? Reference, string? Reason);

    /// <summary>
    /// The saved draw against the athletes eligible now — two different data
    /// states, compared by entry identity (never by count or by name). A saved
    /// draw is never changed by this; it only reports.
    /// </summary>
    public sealed record DrawSync(
        bool HasDraw,
        bool Changed,
        IReadOnlyList<int> EligibleEntryIds,
        IReadOnlyList<int> DrawEntryIds,
        IReadOnlyList<SyncAthlete> Added,
        IReadOnlyList<SyncAthlete> Removed,
        int DrawAthletes,
        int DrawByes,
        int DrawBouts,
        DateTime? GeneratedAt,
        IReadOnlyList<SyncAthlete> Pending,
        int Participants)
    {
        public object Describe() => new
        {
            hasDraw = HasDraw,
            changed = Changed,
            eligibleEntryIds = EligibleEntryIds,
            drawEntryIds = DrawEntryIds,
            added = Added,
            removed = Removed,
            // Assigned to this division on the Participants page (not withdrawn), not in the saved
            // draw and NOT draw-eligible yet, each with the exact missing condition. They never
            // change the draw on their own: once one becomes eligible they move to `added`.
            pending = Pending,
            participants = Participants,
            draw = HasDraw ? new { athletes = DrawAthletes, byes = DrawByes, bouts = DrawBouts, generatedAt = GeneratedAt } : null,
        };
    }

    /// <summary>The entries placed in a stored draw: every athlete appears once in round one.</summary>
    public static HashSet<int> DrawEntryIdsOf(IEnumerable<Bout> bouts) =>
        bouts.Where(b => b.Round == 1)
            .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
            .OfType<int>()
            .ToHashSet();

    public async Task<DrawSync> SyncAsync(TournamentDivision division, CancellationToken cancellationToken = default)
    {
        var bouts = await db.Bouts.AsNoTracking().Where(b => b.DivisionId == division.Id).ToListAsync(cancellationToken);
        var eligible = (await db.TournamentEntries.AsNoTracking()
                .Include(e => e.AthleteRegistration)
                .Where(e => e.DivisionId == division.Id && e.Status == EntryStatuses.Qualified)
                .ToListAsync(cancellationToken))
            .Where(e => DrawEligibility.Eligible(e, division))
            .ToList();
        var eligibleIds = eligible.Select(e => e.Id).ToHashSet();
        var drawIds = DrawEntryIdsOf(bouts);

        // Walkovers came from withdrawals after the draw; the athlete who left
        // is no longer in a corner, so they are found through the entries.
        var removedIds = drawIds.Except(eligibleIds).ToList();
        var removedEntries = await db.TournamentEntries.AsNoTracking()
            .Include(e => e.AthleteRegistration)
            .Where(e => removedIds.Contains(e.Id))
            .ToListAsync(cancellationToken);

        SyncAthlete Describe(TournamentEntry e, string? reason) => new(
            e.Id,
            e.AthleteRegistration is null ? null : NameOf(e),
            e.AthleteRegistration is null ? null : ArabicNameOf(e),
            e.AthleteRegistration?.MembershipNumber ?? e.AthleteRegistration?.ReferenceNumber,
            reason);

        var added = eligible.Where(e => !drawIds.Contains(e.Id)).OrderBy(e => e.Id).Select(e => Describe(e, null)).ToList();
        var removed = removedEntries.OrderBy(e => e.Id)
            .Select(e => Describe(e, WhyNotEligible(e, division) ?? "not in the eligible list"))
            .ToList();

        // Everyone the Participants page lists in this division (every entry not withdrawn), so the
        // two pages reconcile: participants = eligible + pending (+ anyone in the draw no longer eligible).
        var assigned = await db.TournamentEntries.AsNoTracking()
            .Include(e => e.AthleteRegistration)
            .Where(e => e.DivisionId == division.Id && e.Status != EntryStatuses.Withdrawn)
            .ToListAsync(cancellationToken);
        var pending = assigned
            .Where(e => !eligibleIds.Contains(e.Id) && !drawIds.Contains(e.Id))
            .OrderBy(e => e.Id)
            .Select(e => Describe(e, MissingConditions(e, division)))
            .ToList();

        var generatedAt = bouts.Count == 0
            ? (DateTime?)null
            : await db.AuditLog.AsNoTracking()
                .Where(a => a.EntityType == "tournament_division" && a.EntityId == division.Id
                            && (a.Action == AuditActions.DrawCreated || a.Action == AuditActions.DrawAmended
                                || a.Action == AuditActions.DrawRegenerated))
                .OrderByDescending(a => a.Id)
                .Select(a => (DateTime?)a.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

        return new DrawSync(
            bouts.Count > 0,
            bouts.Count > 0 && !drawIds.SetEquals(eligibleIds),
            eligibleIds.OrderBy(x => x).ToList(),
            drawIds.OrderBy(x => x).ToList(),
            bouts.Count > 0 ? added : [],
            removed,
            drawIds.Count,
            bouts.Count(b => b.Round == 1 && b.IsBye && !b.IsWalkover),
            bouts.Count(b => !b.IsBye),
            generatedAt,
            pending,
            assigned.Count);
    }

    /// <summary>Why a Draft regeneration was refused, for the page to act on.</summary>
    public static class RegenerateRefusals
    {
        public const string NoDraw = "no_draw";
        public const string Published = "published";
        public const string Protected = "protected";
        public const string Unchanged = "unchanged";
        public const string DrawChanged = "draw_changed";
    }

    /// <summary>
    /// REQ-10: replaces a Draft whose eligible athletes have changed since it
    /// was generated, with a fresh draw of the athletes eligible now — only
    /// on an explicit, confirmed request with a written reason, never
    /// automatically.
    ///
    /// Refused when the division has no draw, when it is published, when any
    /// bout carries something that would be lost (a winner, a walkover, a
    /// bout number, a date, a time or a ring), when the tournament's schedule
    /// is approved, when nothing has changed, and when either list differs
    /// from the one the administrator reviewed (the eligible list or the
    /// draw's own athletes). The check and the replacement run in one
    /// BEGIN IMMEDIATE transaction: the old bouts are removed and the new
    /// ones written together, or not at all. The result is a Draft again —
    /// not approved, published or scheduled — and the change is audited with
    /// both lists, the reason and the seed.
    /// </summary>
    public async Task<(Outcome Result, string? Refusal, DrawBuilder.Draw? Draw)> RegenerateDraftAsync(
        TournamentDivision division,
        IReadOnlyCollection<int> expectedEntryIds,
        IReadOnlyCollection<int> expectedDrawEntryIds,
        string? reason,
        bool confirmed,
        AdminIdentity.Actor actor,
        bool dryRun = false,
        CancellationToken cancellationToken = default,
        bool revisePublished = false)
    {
        var why = reason?.Trim();
        if (string.IsNullOrWhiteSpace(why))
            return (Outcome.Invalid("يجب ذكر سبب إعادة إنشاء القرعة.", "A reason for regenerating the draft is required."), null, null);
        if (why.Length > 500)
            return (Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters."), null, null);
        if (!confirmed)
            return (Outcome.Invalid("يجب تأكيد إعادة إنشاء القرعة.", "Confirm the regeneration to continue."), null, null);

        await using var transaction = await EmailReservations.BeginExclusiveAsync(db, cancellationToken);

        var existing = await db.Bouts.Where(b => b.DivisionId == division.Id).ToListAsync(cancellationToken);
        if (existing.Count == 0)
            return (Outcome.Conflict("لا توجد قرعة لإعادة إنشائها.", "This division has no draw to regenerate."), RegenerateRefusals.NoDraw, null);
        // A published draw is regenerated only on the bracket page's explicit request (revisePublished): the result is
        // a Draft, and the published version stays on the website until the updated draw is published.
        var revising = division.DrawPublishedAt is not null;
        if (revising && !revisePublished)
            return (Outcome.Conflict(
                "القرعة منشورة؛ لا يمكن إعادة إنشائها من هنا.",
                "This draw is published. A published draw cannot be regenerated from here."), RegenerateRefusals.Published, null);
        // A published bout schedule does not block it: the website keeps that schedule version (a stored snapshot)
        // until an updated schedule is approved and explicitly published; Bout Schedule flags the affected divisions.

        var tournament = await db.Tournaments.FirstAsync(t => t.Id == division.TournamentId, cancellationToken);
        // D4: a walkover is a recorded outcome of a withdrawal; it is never cleared by regenerating.
        if (existing.Any(b => b.IsWalkover))
            return (Outcome.Conflict(
                "تتضمن القرعة فوزًا بالانسحاب؛ لا يمكن إعادة إنشائها، ويبقى الفوز بالانسحاب قائمًا.",
                "This draw contains a walkover from a withdrawal. It cannot be regenerated; the walkover stands."), RegenerateRefusals.Protected, null);
        // Division-level lock: only a bout of THIS division that has started blocks. Bouts of other divisions never
        // do, and a scheduled bout that has not started does not either (it is rescheduled — see below).
        if (existing.Any(BoutStarted))
            return (Outcome.Conflict(
                "بدأ نزال في هذه الفئة (سُجّلت نتيجة)؛ لا يمكن إعادة إنشاء القرعة.",
                "A bout in this division has started (a result is recorded). The draw can no longer be regenerated."),
                RegenerateRefusals.Protected, null);
        // The division's bouts take part in the bout schedule when any is scheduled or the division was saved there.
        var scheduled = existing.Any(b => b.BoutNumber is not null || b.ScheduledDate is not null || b.StartTime is not null
                                          || b.RingId is not null || b.OrderInRing is not null)
                        || division.ScheduleSavedAt is not null;

        var pool = (await db.TournamentEntries.AsNoTracking()
                .Where(e => e.DivisionId == division.Id && e.Status == EntryStatuses.Qualified)
                .ToListAsync(cancellationToken))
            .Where(e => DrawEligibility.Eligible(e, division))
            .Select(e => new DrawBuilder.Contender(e.Id, DrawClub.Of(e)))
            .ToList();
        var poolIds = pool.Select(c => c.EntryId).ToHashSet();
        var drawIds = DrawEntryIdsOf(existing);

        if (!expectedDrawEntryIds.ToHashSet().SetEquals(drawIds))
            return (Outcome.Conflict(
                "تغيّرت القرعة منذ مراجعتها. يرجى المراجعة من جديد.",
                "The saved draw has changed since it was reviewed. Review it again."), RegenerateRefusals.DrawChanged, null);
        if (!expectedEntryIds.ToHashSet().SetEquals(poolIds))
            return (Outcome.Conflict(
                "تغيرت قائمة اللاعبين المعتمدين منذ عرضها. يرجى مراجعة القائمة.",
                "The approved athletes have changed since this page was loaded. Review the list again."), GenerateRefusals.Stale, null);
        if (poolIds.SetEquals(drawIds))
            return (Outcome.Conflict(
                "لم تتغير قائمة اللاعبين المؤهلين؛ لا حاجة لإعادة إنشاء القرعة.",
                "The eligible athletes match the saved draw; there is nothing to regenerate."), RegenerateRefusals.Unchanged, null);

        var plan = DrawMath.For(pool.Count);
        if (plan.Kind is DrawMath.Kind.NoEligibleAthletes or DrawMath.Kind.NoContest)
            return (Outcome.Conflict(
                "يلزم لاعبان مؤهلان على الأقل لإجراء القرعة.",
                "At least two athletes with Final Draw Approval are needed to generate a draw."), GenerateRefusals.NotEnough, null);
        if (plan.Kind == DrawMath.Kind.OverCapacity)
            return (Outcome.Conflict(
                $"عدد اللاعبين ({pool.Count}) يتجاوز الحد المعتمد ({DrawMath.MaxAthletes}).",
                $"{pool.Count} athletes is more than the {DrawMath.MaxAthletes} the current competition rules provide for."), GenerateRefusals.OverCapacity, null);

        // Every check passed; a dry run stops here (the transaction is rolled back, nothing is written
        // or audited), so the dialog can validate before the generation screen sends the real request.
        if (dryRun) return (Outcome.Success(), null, null);

        var seed = Random.Shared.Next();
        var draw = DrawBuilder.Build(pool, seed);

        // Keep what is public: a draw published before versions were recorded gets its version now, from the bouts
        // being replaced, so the website keeps showing exactly that bracket until the update is published.
        DrawPublication? kept = revising ? await CurrentPublicationAsync(division.Id, cancellationToken) : null;
        if (revising && kept is null)
        {
            var publishedBy = await db.AuditLog.AsNoTracking()
                .Where(a => a.EntityType == "tournament_division" && a.EntityId == division.Id && a.Action == AuditActions.DrawPublished)
                .OrderByDescending(a => a.Id).Select(a => a.ActorName).FirstOrDefaultAsync(cancellationToken) ?? "unknown";
            kept = await RecordPublicationAsync(division, existing, division.DrawPublishedAt!.Value, publishedBy,
                "Recorded from the published draw when it was regenerated.", cancellationToken);
        }

        db.Bouts.RemoveRange(existing);
        await db.SaveChangesAsync(cancellationToken);
        await WriteAsync(division, draw, cancellationToken);
        division.DrawPublishedAt = null;

        // Only this division is rescheduled: its new bouts are unscheduled and it returns to Not Scheduled. The bout
        // schedule's revision moves on; an APPROVED schedule loses its approval (recorded with the reason), exactly as
        // an edit of an approved schedule does. A published schedule never gets here (refused above).
        var approvalCancelled = false;
        if (scheduled || revising)
        {
            division.ScheduleSavedAt = null;
            division.ScheduleSavedBy = null;
            division.ScheduleSavedRevision = null;
            division.ScheduleSavedSource = null;
            if (tournament.ScheduleStatus is not null)
            {
                if (tournament.ScheduleApprovedAt is not null || tournament.ScheduleStatus == ScheduleService.Statuses.Approved)
                {
                    audit.Write(actor, AuditActions.ScheduleApprovalInvalidated, "tournament", tournament.Id, tournament.NameEn,
                        fromStatus: "schedule_approved", toStatus: "schedule_draft",
                        details: $"Approval by {tournament.ScheduleApprovedBy ?? "unknown"} on {tournament.ScheduleApprovedAt:yyyy-MM-dd HH:mm} UTC "
                                 + $"(revision {tournament.ScheduleApprovedRevision}) cancelled because {actor.Username} regenerated the "
                                 + $"{division.Describe(arabic: false)} draw, whose bouts must be scheduled again. Reason: {why}. "
                                 + "The schedule is a Draft again and must be reviewed and approved before publication.");
                    tournament.ScheduleApprovedAt = null;
                    tournament.ScheduleApprovedBy = null;
                    approvalCancelled = true;
                }
                if (tournament.ScheduleStatus is ScheduleService.Statuses.Approved or ScheduleService.Statuses.Review)
                {
                    tournament.ScheduleStatus = ScheduleService.Statuses.Draft;
                    tournament.ScheduleSubmittedAt = null;
                    tournament.ScheduleSubmittedBy = null;
                }
                tournament.ScheduleRevision++;
                tournament.ScheduleUpdatedAt = DateTime.UtcNow;
                tournament.ScheduleUpdatedBy = actor.Username;
            }
        }

        string Ids(IEnumerable<int> ids) => ids.Any() ? string.Join(", ", ids.OrderBy(x => x).Select(x => "#" + x)) : "none";
        audit.Write(actor, AuditActions.DrawRegenerated, "tournament_division", division.Id,
            division.Describe(arabic: false),
            details: (revising
                         ? $"Published draw regenerated as an updated Draft; published version {kept!.Version} stays on the website "
                           + "until the updated draw is published. "
                         : "")
                     + $"Draft regenerated in Draw Management: {drawIds.Count} -> {pool.Count} athletes, "
                     + $"{draw.ByeCount} bye(s), {pool.Count - 1} bouts, seed {seed}, algorithm {DrawBuilder.AlgorithmVersion}. "
                     + $"Added: {Ids(poolIds.Except(drawIds))}. Removed: {Ids(drawIds.Except(poolIds))}. "
                     + $"Previous entries: {Ids(drawIds)}. Reason: {why}"
                     + (scheduled ? " The division's bouts were scheduled and must be scheduled again (other divisions unchanged)." : "")
                     + (approvalCancelled ? " The bout schedule's approval was cancelled." : ""));
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return (Outcome.Success(), null, draw);
    }

    /// <summary>One athlete in a draft draw who may no longer be in it.</summary>
    public sealed record Ineligible(int EntryId, string? Name, string? MemberId, string Reason);

    /// <summary>
    /// Publishing is what lets the schedule see the division (REQ-11 rule 1).
    ///
    /// Every athlete in the draft is checked again first: a decision can be
    /// changed, or a result corrected, after the draft was made. If anyone is
    /// no longer an approved, eligible athlete of this division, nothing is
    /// published — the draft has to be corrected or redrawn. Nobody is taken
    /// out automatically.
    /// </summary>
    /// <summary>Why a publication was refused, for the page to act on (besides <see cref="ScheduleService.ApprovedCode"/>).</summary>
    public static class PublishRefusals
    {
        public const string AlreadyPublished = "already_published";
        public const string NoDraw = "no_draw";
        public const string Ineligible = "ineligible_athletes";
        public const string EligibilityChanged = "eligibility_changed";
        public const string Stale = "stale_review";
        public const string Integrity = "integrity";
    }

    /// <param name="expectedDrawEntryIds">When given (Draw Management's confirmation dialog), the saved draw's athletes the publisher reviewed.</param>
    /// <param name="expectedEntryIds">When given, the eligible athletes the publisher reviewed.</param>
    public async Task<(Outcome Result, IReadOnlyList<Ineligible> Ineligible)> PublishAsync(
        TournamentDivision division,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        IReadOnlyCollection<int>? expectedDrawEntryIds = null,
        IReadOnlyCollection<int>? expectedEntryIds = null)
    {
        // SCH-001 — publishing adds the division to the bout schedule (REQ-11 rule 1),
        // so it is refused while the schedule is approved; checked under the write lock.
        await using var transaction = await BeginAsync(cancellationToken);
        await db.Entry(division).ReloadAsync(cancellationToken);

        // A second request (a double click, a second tab, a retry after a lost response) never
        // publishes again: the first publication, its time and its audit line stand.
        if (division.DrawPublishedAt is not null)
        {
            return (Outcome.Conflict(
                "القرعة منشورة بالفعل.",
                $"This draw is already published (since {division.DrawPublishedAt:yyyy-MM-dd HH:mm} UTC). Nothing was changed.")
                with { Code = PublishRefusals.AlreadyPublished }, []);
        }
        var approvedSchedule = await db.Tournaments.AsNoTracking()
            .Where(t => t.Id == division.TournamentId).Select(t => t.ScheduleApprovedAt).FirstOrDefaultAsync(cancellationToken);
        if (approvedSchedule is not null && division.DrawPublishedAt is null)
        {
            return (Outcome.Conflict(
                "جدول النزالات معتمد؛ نشر قرعة جديدة يضيفها إلى الجدول، لذلك يجب سحب اعتماد الجدول أولًا.",
                "The bout schedule is approved. Publishing this draw would add its bouts to the approved schedule, "
                + "so a schedule approver must first withdraw the approval, with a reason.") with { Code = ScheduleService.ApprovedCode }, []);
        }

        var bouts = await db.Bouts.AsNoTracking()
            .Where(b => b.DivisionId == division.Id)
            .ToListAsync(cancellationToken);
        if (bouts.Count == 0)
        {
            return (Outcome.Conflict(
                "لا توجد قرعة لنشرها.",
                "There is no draw to publish.") with { Code = PublishRefusals.NoDraw }, []);
        }

        // The bracket must be a sound single-elimination tree whose round one holds exactly its athletes.
        var drawIds = DrawEntryIdsOf(bouts);
        var departed = await db.TournamentEntries.AsNoTracking()
            .Where(e => e.DivisionId == division.Id && e.Status == EntryStatuses.Withdrawn)
            .Select(e => e.Id).ToListAsync(cancellationToken);
        var problems = DrawIntegrity.Check(bouts.Select(RowOf).ToList(), drawIds, departed);
        if (problems.Count > 0)
        {
            return (Outcome.Conflict(
                "القرعة المحفوظة لا تشكل شجرة إقصاء سليمة؛ لم يُنشر شيء.",
                "The saved draw is not a sound single-elimination bracket, so it was not published: "
                + string.Join("; ", problems.Take(5)) + ".") with { Code = PublishRefusals.Integrity }, []);
        }

        var ids = bouts.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
            .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();
        var entries = await db.TournamentEntries.AsNoTracking()
            .Include(e => e.AthleteRegistration)
            .Where(e => ids.Contains(e.Id))
            .ToListAsync(cancellationToken);

        var ineligible = entries
            .Select(e => (Entry: e, Reason: WhyNotEligible(e, division)))
            .Where(x => x.Reason is not null)
            .Select(x => new Ineligible(x.Entry.Id, NameOf(x.Entry),
                x.Entry.AthleteRegistration?.MembershipNumber ?? x.Entry.AthleteRegistration?.ReferenceNumber, x.Reason!))
            .ToList();

        if (ineligible.Count > 0)
        {
            var list = string.Join("; ", ineligible.Select(i => $"{i.Name ?? "Entry #" + i.EntryId} ({i.MemberId}): {i.Reason}"));
            return (Outcome.Conflict(
                $"لا يمكن نشر قرعة {division.Describe(arabic: true)}: لاعبون غير مؤهلين. صحّح القرعة أو أعد إجراءها.",
                $"The {division.Describe(arabic: false)} draw cannot be published: {list}. "
                + "Correct the draft or redraw the division, then publish.") with { Code = PublishRefusals.Ineligible }, ineligible);
        }

        // The other direction: an athlete eligible now who is not in the saved draw (a transfer in,
        // an approval given after the draw) would be left out of a published bracket. The Draft has
        // to be regenerated first — never silently, so publication is refused.
        var eligibleIds = (await db.TournamentEntries.AsNoTracking()
                .Where(e => e.DivisionId == division.Id && e.Status == EntryStatuses.Qualified)
                .ToListAsync(cancellationToken))
            .Where(e => DrawEligibility.Eligible(e, division))
            .Select(e => e.Id)
            .ToHashSet();
        if (!eligibleIds.SetEquals(drawIds))
        {
            var missing = eligibleIds.Except(drawIds).OrderBy(x => x).Select(x => "#" + x);
            return (Outcome.Conflict(
                "تغيرت قائمة اللاعبين المؤهلين منذ إنشاء القرعة؛ يجب إعادة إنشاء المسودة قبل النشر.",
                $"The eligible athletes no longer match the saved draw (eligible now but not in the draw: {string.Join(", ", missing)}). "
                + "Regenerate the Draft, review it, then publish.") with { Code = PublishRefusals.EligibilityChanged }, []);
        }

        // What the publisher confirmed must still be what is saved (Draw Management sends both lists).
        if ((expectedDrawEntryIds is not null && !expectedDrawEntryIds.ToHashSet().SetEquals(drawIds))
            || (expectedEntryIds is not null && !expectedEntryIds.ToHashSet().SetEquals(eligibleIds)))
        {
            return (Outcome.Conflict(
                "تغيرت القرعة أو قائمة المؤهلين منذ مراجعتها. يرجى المراجعة من جديد.",
                "The draw or the eligible athletes changed after you reviewed them. Review the bracket again before publishing.")
                with { Code = PublishRefusals.Stale }, []);
        }

        division.DrawPublishedAt = DateTime.UtcNow;
        var replaced = await CurrentPublicationAsync(division.Id, cancellationToken);
        var recorded = await RecordPublicationAsync(division, bouts, division.DrawPublishedAt.Value, actor.Username,
            replaced is null ? null : $"Updated draw; replaces version {replaced.Version}.", cancellationToken);

        audit.Write(actor, AuditActions.DrawPublished, "tournament_division", division.Id,
            division.Describe(arabic: false),
            details: $"Draw published (version {recorded.Version}"
                     + (replaced is null ? ")" : $", replacing version {replaced.Version}, which is kept for the record)") + ": "
                     + $"{drawIds.Count} athletes, {bouts.Count(b => b.Round == 1 && b.IsBye && !b.IsWalkover)} bye(s), "
                     + $"{bouts.Count(b => !b.IsBye)} bouts. Every athlete re-checked as eligible; the eligible list matched the saved draw; "
                     + "bracket integrity verified. No bout schedule was generated or approved.");
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);

        return (Outcome.Success(), []);
    }

    /// <summary>
    /// Every draw condition an entry of this division does not meet yet, in the order the
    /// readiness desk works through them — not only the first, so an administrator sees the
    /// whole path to eligibility (for example after a class change cleared a weigh-in and the
    /// Final Draw Approval). The rule itself is <see cref="DrawEligibility.Eligible"/>.
    /// </summary>
    public static string MissingConditions(TournamentEntry e, TournamentDivision division)
    {
        if (e.Status == EntryStatuses.Rejected) return "Rejected at Final Approval";
        if (e.Status == EntryStatuses.Disqualified) return "DSQ (No Show)";
        if (e.Status == EntryStatuses.Withdrawn) return "withdrawn";

        var missing = new List<string>();
        if (e.CheckedInAt is null) missing.Add("not checked in");
        if (e.MedicalResult == ReadinessResults.Failed) missing.Add("failed the medical examination");
        else if (e.MedicalResult != ReadinessResults.Passed) missing.Add("medical examination not passed");

        var range = WeighInRange.For(division);
        if (e.WeighInResult == ReadinessResults.Failed) missing.Add("failed the weigh-in");
        else if (e.WeighInResult != ReadinessResults.Passed)
        {
            // A class change clears the weigh-in result but keeps the measured weight: say whether
            // that weight would fit this class, because a new weigh-in is what is needed.
            var note = e.ActualWeightKg is { } kg && range.Resolved
                ? range.Check(kg) == WeighInVerdict.Matches
                    ? $" (last measured {WeighInWeights.Kg(kg)} kg, within {division.WeightLabel(false)})"
                    : $" (last measured {WeighInWeights.Kg(kg)} kg, outside {division.WeightLabel(false)}: accepted {range.Text()})"
                : string.Empty;
            missing.Add($"no weigh-in result for this class{note}");
        }
        else if (DrawEligibility.StaleWeighIn(e, division) is { } stale) missing.Add($"weigh-in no longer valid: {stale}");

        if (!e.IsQualified) missing.Add("no Final Draw Approval");
        return missing.Count == 0 ? "not draw-eligible" : string.Join("; ", missing);
    }

    /// <summary>Null when the entry may be in this division's draw; otherwise why not.</summary>
    public static string? WhyNotEligible(TournamentEntry e, TournamentDivision division)
    {
        if (e.DivisionId != division.Id) return "no longer in this weight class";
        if (e.Status == EntryStatuses.Rejected) return "Rejected at Final Approval";
        if (e.Status == EntryStatuses.Disqualified) return "DSQ (No Show)";
        if (e.Status == EntryStatuses.Withdrawn) return "withdrawn";
        if (e.MedicalResult == ReadinessResults.Failed) return "Failed the medical examination";
        if (e.WeighInResult == ReadinessResults.Failed) return "Failed the weigh-in";
        if (e.CheckedInAt is null) return "not checked in";
        if (e.MedicalResult != ReadinessResults.Passed) return "medical examination not passed";
        if (e.WeighInResult != ReadinessResults.Passed) return "weigh-in not passed";
        // A Passed recorded for another class, or under a rule since replaced.
        if (DrawEligibility.StaleWeighIn(e, division) is { } stale) return $"weigh-in no longer valid: {stale}";
        if (!e.IsQualified) return "no Final Approval";
        return null;
    }

    /// <summary>The athlete's display name from their registration, for lists (null when unreadable).</summary>
    public static string? DisplayName(TournamentEntry e, bool arabic) => arabic ? ArabicNameOf(e) : NameOf(e);

    private static string? NameOf(TournamentEntry e)
    {
        if (e.AthleteRegistration is null) return null;
        try
        {
            using var payload = System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson);
            return RegistrationPayload.DisplayName(payload.RootElement, false);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    private static string? ArabicNameOf(TournamentEntry e)
    {
        if (e.AthleteRegistration is null) return null;
        try
        {
            using var payload = System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson);
            return RegistrationPayload.DisplayName(payload.RootElement, true);
        }
        catch (System.Text.Json.JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// REQ-10 rule 6 — moving athletes within a drawn division. The reason is
    /// compulsory and the change is logged; for a published draw only the
    /// Technical Delegate may do it, and needs nobody else's approval (D1).
    ///
    /// Remediation (DRW-003, DRW-004, DRW-005, D2, D6): only round-one
    /// positions change — later rounds are filled by advancement. Naming the
    /// athlete in the other corner swaps the two corners; naming an athlete
    /// placed in another round-one bout exchanges the two athletes atomically
    /// (a BYE holder's place in round two moves with them). Emptying a corner
    /// is refused (a removal is a withdrawal, with a walkover), as is placing
    /// an athlete who is not in the draw (replacement is deferred), giving a
    /// BYE an opponent, and any change under an approved schedule, a result or
    /// a walkover. The whole bracket is checked before anything is saved.
    /// </summary>
    public async Task<DrawChange> AmendCornerAsync(
        Bout bout,
        string corner,
        int? entryId,
        string reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var why = reason?.Trim();
        if (string.IsNullOrWhiteSpace(why))
            return new DrawChange(Outcome.Invalid("تعديل القرعة يتطلب ذكر السبب.", "Amending a draw requires a reason."));
        if (why.Length > 500)
            return new DrawChange(Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters."));
        if (corner is not ("red" or "blue"))
            return new DrawChange(Outcome.Invalid("ركن غير معروف.", "Unknown corner."));

        await using var transaction = await BeginAsync(cancellationToken);
        await db.Entry(bout).ReloadAsync(cancellationToken);
        var division = await db.TournamentDivisions.FirstAsync(d => d.Id == bout.DivisionId, cancellationToken);
        var bouts = await db.Bouts.Where(b => b.DivisionId == bout.DivisionId).ToListAsync(cancellationToken);

        if (DelegateOnly(division, true, actor) is { } notDelegate) return notDelegate;
        var tournament = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == division.TournamentId, cancellationToken);
        if (Protect(tournament, division, bouts) is { } protectedDraw) return protectedDraw;

        if (bout.Round != 1)
            return Refused(DrawRefusals.RoundLocked,
                "يمكن تعديل مراكز الدور الأول فقط؛ الأدوار اللاحقة تُملأ بالتأهل.",
                "Only first-round positions can be changed. Later rounds are filled by advancement.");

        var current = corner == "red" ? bout.RedEntryId : bout.BlueEntryId;
        var other = corner == "red" ? bout.BlueEntryId : bout.RedEntryId;

        if (entryId is not { } id)
            return Refused(DrawRefusals.UseWithdrawal,
                "لا يُخرج اللاعب من القرعة بإفراغ ركنه؛ يُسجَّل انسحابه مع السبب، فيتأهل منافسه بالانسحاب.",
                "An athlete cannot be taken out of a drawn division by emptying their corner. Withdraw the entry instead "
                + "(a reason is required); the opponent then advances by walkover.");
        if (id == current)
            return Refused(DrawRefusals.NoChange, "اللاعب في هذا الركن بالفعل.", "That athlete is already in this corner.");
        if (bout.IsBye && (corner == "blue" || current is null))
            return Refused(DrawRefusals.WouldBreakByes,
                "لا يمكن إعطاء صاحب الراحة منافسًا؛ ذلك يغيّر عدد مرات الراحة في القرعة.",
                "A BYE cannot be given an opponent: that would change the number of BYEs the bracket needs. "
                + "To give the BYE to another athlete, choose this BYE's red corner and the athlete to exchange with.");

        var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == id && e.DivisionId == bout.DivisionId, cancellationToken);
        if (entry is null)
            return Refused(DrawRefusals.NotInDraw, "هذا اللاعب ليس ضمن هذه الفئة.", "That athlete is not in this division.");

        var roundOne = bouts.Where(b => b.Round == 1).ToList();
        var expected = DrawEntryIdsOf(bouts);
        var source = other == id ? bout : roundOne.FirstOrDefault(b => b.RedEntryId == id || b.BlueEntryId == id);
        if (source is null)
            return Refused(DrawRefusals.NotInDraw,
                "هذا اللاعب ليس ضمن القرعة. إدخال لاعب من خارج القرعة (الاستبدال) غير متاح؛ لتغيير اللاعبين تُعاد القرعة.",
                "That athlete is not in this draw. Placing an athlete from outside the draw (a replacement) is not available; "
                + "to change who is in the division, redraw it.");

        // Only an athlete with Final Approval goes into a draw position — by amendment as by drawing.
        if (other != id && !DrawEligibility.Eligible(entry, division))
            return Refused("not_eligible",
                "لا يدخل القرعة إلا لاعب معتمد نهائيًا بوزن مطابق لفئته.",
                "Only an athlete with Final Approval, on a weigh-in that holds for this class, can be placed in a draw.");

        string detail;
        if (source.Id == bout.Id)
        {
            // Naming the athlete in the other corner is how a jury asks for the
            // two to change places; one move, never the same athlete twice.
            (bout.RedEntryId, bout.BlueEntryId) = (bout.BlueEntryId, bout.RedEntryId);
            detail = $"corners swapped in bout {bout.Id}: red {bout.RedEntryId} / blue {bout.BlueEntryId}.";
        }
        else
        {
            var sourceCorner = source.RedEntryId == id ? "red" : "blue";
            if (sourceCorner == "red") source.RedEntryId = current; else source.BlueEntryId = current;
            if (corner == "red") bout.RedEntryId = id; else bout.BlueEntryId = id;
            ReseatAdvancement(bouts);
            detail = $"exchange: entry {id} moved from bout {source.Id} {sourceCorner} to bout {bout.Id} {corner}; "
                     + $"entry {current} moved from bout {bout.Id} {corner} to bout {source.Id} {sourceCorner}.";
        }

        var problems = DrawIntegrity.Check(bouts.Select(RowOf).ToList(), expected);
        if (problems.Count > 0) return IntegrityRefusal(problems);

        var slotted = new[] { bout, source }.Distinct().Where(HasSlot).ToList();
        var slotNote = slotted.Count == 0 ? string.Empty
            : " Scheduled bout(s) " + string.Join(", ", slotted.Select(b => $"#{b.BoutNumber?.ToString() ?? "-"} (bout {b.Id})"))
              + " keep their number, ring and time; their athletes changed.";

        audit.Write(actor, AuditActions.DrawAmended, "bout", bout.Id, division.Describe(arabic: false),
            fromStatus: division.DrawPublishedAt is null ? "draft" : "published",
            toStatus: division.DrawPublishedAt is null ? "draft" : "published",
            details: $"{detail}{slotNote} Reason: {why}");

        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return new DrawChange(Outcome.Success());
    }

    /// <summary>
    /// After a round-one exchange, puts every BYE holder back into the
    /// round-two corner their BYE feeds (the same rule as DrawBuilder.Advance).
    /// Only used while the division has no result and no walkover.
    /// </summary>
    private static void ReseatAdvancement(IReadOnlyCollection<Bout> bouts)
    {
        foreach (var later in bouts.Where(b => b.Round > 1))
        {
            later.RedEntryId = null;
            later.BlueEntryId = null;
        }
        var byId = bouts.ToDictionary(b => b.Id);
        foreach (var bye in bouts.Where(b => b.Round == 1 && b.IsBye && b.RedEntryId is not null))
        {
            if (bye.WinnerToBoutId is not { } nextId || !byId.TryGetValue(nextId, out var next)) continue;
            if (bye.WinnerToCorner == "red") next.RedEntryId = bye.RedEntryId; else next.BlueEntryId = bye.RedEntryId;
        }
    }

    /// <summary>
    /// REQ-10 rules 7 and 8 — a withdrawal. Before the draw the athlete simply
    /// leaves the division. Afterwards their opponent advances as a walkover,
    /// because the bracket has already been published and cannot quietly
    /// reshape itself.
    ///
    /// Remediation (DRW-003, D2, D5): runs inside the caller's write-locked
    /// transaction together with the entry's status change, so both commit or
    /// neither does. A bout already decided (a result, or a walkover) is never
    /// rewritten; a walkover keeps its bout number, ring and time; the
    /// opponent's next corner is only filled when it is empty; the bracket is
    /// checked before saving. Allowed after schedule approval, and audited so.
    /// </summary>
    public async Task<DrawChange> ApplyWithdrawalAsync(
        TournamentEntry entry,
        string? reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        await using var transaction = await BeginAsync(cancellationToken);
        var bouts = entry.DivisionId is { } divisionId
            ? await db.Bouts.Where(b => b.DivisionId == divisionId).ToListAsync(cancellationToken)
            : [];
        var mine = bouts.Where(b => b.RedEntryId == entry.Id || b.BlueEntryId == entry.Id)
            .OrderBy(b => b.Round).ToList();

        if (mine.Count == 0)
        {
            // Not drawn yet: nothing to unpick.
            entry.DivisionId = null;
            await db.SaveChangesAsync(cancellationToken);
            if (transaction is not null) await transaction.CommitAsync(cancellationToken);
            return new DrawChange(Outcome.Success());
        }

        var tournament = await db.Tournaments.AsNoTracking().FirstAsync(t => t.Id == entry.TournamentId, cancellationToken);
        var afterApproval = tournament.ScheduleApprovedAt is not null ? " (after schedule approval)" : string.Empty;
        var byId = bouts.ToDictionary(b => b.Id);
        var lines = new List<(Bout Bout, string Text)>();

        foreach (var bout in mine)
        {
            // History stays: a bout already decided is not rewritten.
            if (bout.WinnerEntryId is not null) continue;

            var opponent = bout.RedEntryId == entry.Id ? bout.BlueEntryId : bout.RedEntryId;
            if (bout.RedEntryId == entry.Id) bout.RedEntryId = null;
            else bout.BlueEntryId = null;

            if (bout.IsBye && !bout.IsWalkover)
            {
                lines.Add((bout, $"Entry {entry.Id} withdrew; their BYE is vacated."));
                continue;
            }

            if (opponent is not null)
            {
                bout.IsWalkover = true;
                bout.IsBye = true;
                bout.WinnerEntryId = opponent;

                // Walk the opponent into the next round, as a bye would.
                if (bout.WinnerToBoutId is { } nextId && byId.TryGetValue(nextId, out var next))
                {
                    var occupant = bout.WinnerToCorner == "red" ? next.RedEntryId : next.BlueEntryId;
                    if (occupant is not null && occupant != opponent)
                        return IntegrityRefusal([$"bout {next.Id} {bout.WinnerToCorner} corner is already held by entry {occupant}"]);
                    if (bout.WinnerToCorner == "red") next.RedEntryId = opponent;
                    else next.BlueEntryId = opponent;
                }
                lines.Add((bout, $"Entry {entry.Id} withdrew; entry {opponent} advances as a walkover"
                                 + (bout.BoutNumber is { } number ? $" (bout #{number} keeps its number, ring and time)" : string.Empty) + "."));
            }
            else
            {
                lines.Add((bout, $"Entry {entry.Id} withdrew; no opponent to advance yet."));
            }
        }

        var departed = await db.TournamentEntries.AsNoTracking()
            .Where(e => e.DivisionId == entry.DivisionId && e.Status == EntryStatuses.Withdrawn)
            .Select(e => e.Id).ToListAsync(cancellationToken);
        departed.Add(entry.Id);
        var problems = DrawIntegrity.Check(bouts.Select(RowOf).ToList(), departed: departed);
        if (problems.Count > 0) return IntegrityRefusal(problems);

        foreach (var (bout, text) in lines)
        {
            audit.Write(actor, AuditActions.DrawAmended, "bout", bout.Id,
                details: text + afterApproval + (string.IsNullOrWhiteSpace(reason) ? string.Empty : $" Reason: {reason.Trim()}"));
        }

        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return new DrawChange(Outcome.Success());
    }

    /// <summary>The division's bracket, shaped for display.</summary>
    /// <summary>
    /// The athlete's profile photo: the registration's <c>personalPhoto</c>
    /// attachment and nothing else — never an ID, passport, medical document
    /// or a club logo — and only when the stored file resolves and is an image.
    /// </summary>
    public static string? AthletePhotoId(RegistrationAttachmentStore store, string? payloadJson)
    {
        var id = RegistrationPayload.Attachment(payloadJson, "personalPhoto");
        if (id is null || !store.TryResolve(id, out _, out var meta)) return null;
        return meta.ContentType is "image/jpeg" or "image/png" or "image/webp" or "image/gif" ? id : null;
    }

    public async Task<object> BracketAsync(TournamentDivision division, CancellationToken cancellationToken = default)
    {
        var bouts = await db.Bouts
            .Where(b => b.DivisionId == division.Id)
            .OrderBy(b => b.Round).ThenBy(b => b.Position)
            .ToListAsync(cancellationToken);

        var totalRounds = bouts.Count == 0 ? 0 : bouts.Max(b => b.Round);
        /* "Preliminary" describes a first round the *draw* left partly empty
           (REQ-10 rule 5). A walkover from a later withdrawal also empties a
           corner, but the round was full when it was drawn and its name should
           not change afterwards. */
        var firstRoundPartial = bouts.Any(b => b.Round == 1 && b.IsBye && !b.IsWalkover);

        var entryIds = bouts
            .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
            .Where(id => id is not null).Select(id => id!.Value).Distinct().ToList();

        var entries = await db.TournamentEntries
            .Include(e => e.AthleteRegistration)
            .Where(e => entryIds.Contains(e.Id))
            .ToListAsync(cancellationToken);

        var names = entries.ToDictionary(
            e => e.Id,
            e => new
            {
                e.Id,
                nameAr = e.AthleteRegistration is null
                    ? null
                    : RegistrationPayload.DisplayName(
                        System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson).RootElement, true),
                nameEn = e.AthleteRegistration is null
                    ? null
                    : RegistrationPayload.DisplayName(
                        System.Text.Json.JsonDocument.Parse(e.AthleteRegistration.PayloadJson).RootElement, false),
                club = DrawClub.Of(e),
                e.Status,
                // The athlete's own profile photo, if one is on file: a short
                // version key (changes when the photo is replaced), never the file.
                photoKey = AthletePhotoId(attachments, e.AthleteRegistration?.PayloadJson) is { } photo
                    ? photo[..12]
                    : null,
            });

        return new
        {
            division = new
            {
                division.Id,
                division.Category,
                division.Gender,
                division.WeightLimitKg,
                labelAr = division.Describe(arabic: true),
                labelEn = division.Describe(arabic: false),
                division.DrawPublishedAt,
            },
            totalRounds,
            rounds = Enumerable.Range(1, totalRounds).Select(round => new
            {
                round,
                nameAr = BoutRounds.Name(round, totalRounds, round == 1 && firstRoundPartial).Ar,
                nameEn = BoutRounds.Name(round, totalRounds, round == 1 && firstRoundPartial).En,
                bouts = bouts.Where(b => b.Round == round).Select(b => new
                {
                    b.Id,
                    b.Position,
                    b.IsBye,
                    b.IsWalkover,
                    b.WinnerToBoutId,
                    b.WinnerToCorner,
                    b.WinnerEntryId,
                    // Step 3: only the official, published number is ever shown (the per-day value is internal).
                    BoutNumber = b.OfficialBoutNumber,
                    b.ScheduledDate,
                    b.StartTime,
                    b.RingId,
                    red = b.RedEntryId is { } r && names.TryGetValue(r, out var redEntry) ? redEntry : null,
                    blue = b.BlueEntryId is { } l && names.TryGetValue(l, out var blueEntry) ? blueEntry : null,
                }),
            }),
        };
    }
}
