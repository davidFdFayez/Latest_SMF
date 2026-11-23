using System.Text.Json.Nodes;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Endpoints;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// The bout schedule — Phase 3 REQ-11 with the federation's approved Stage 5
/// decisions (see <see cref="BoutScheduler"/> for the rules).
///
/// The schedule lives on the bracket's own bout rows (one row per source
/// bout: day, ring, queue position, start time, daily number), so a source
/// bout can never be scheduled twice and its identity never changes. Matchups,
/// corners, progression and byes belong to the draw engine and are never
/// written here.
///
/// Every write runs under SQLite's write lock (BEGIN IMMEDIATE) in one
/// transaction: the checks, the queue change, the recalculation of the
/// affected days and the audit line commit together or not at all. Each write
/// carries the revision the screen was showing; a stale one is refused, so a
/// concurrent edit is never overwritten. An approved schedule is frozen until
/// an approver withdraws the approval with a reason (SCH-001 / D3).
/// </summary>
public class ScheduleService(SmfDbContext db, AuditLogger audit, RegistrationAttachmentStore attachments)
{
    public const string ApprovedCode = "schedule_approved";
    public const string StaleCode = "stale_revision";

    public static class Statuses
    {
        public const string Draft = "draft";
        public const string Review = "review";
        public const string Approved = "approved";
    }

    /// <summary>Half an hour, the ring default when a ring/day has no timing of its own.</summary>
    public const int DefaultIntervalMinutes = 30;

    public static Outcome Frozen() => Outcome.Conflict(
        "جدول النزالات معتمد؛ تغييره يلغي الاعتماد ويتطلب ذكر السبب، ثم المراجعة والاعتماد من جديد.",
        "The bout schedule is approved. Changing it cancels the approval and needs a written reason; the schedule must "
        + "then be reviewed and approved again.") with { Code = ApprovedCode };

    public const string PublishedCode = "published";

    /// <summary>
    /// Step 3 correction — the written reason for changing an APPROVED (not
    /// published) schedule, set by the Stage 5 endpoints from the request. A
    /// change with it cancels the approval (see <see cref="Touch"/>); without it
    /// an approved schedule stays frozen. Legacy endpoints never set it.
    /// </summary>
    public string? ApprovalChangeReason { get; set; }

    private static Outcome Refuse(string code, string ar, string en, int status = 409) =>
        new Outcome(false, status, ar, en) with { Code = code };

    /* ── the guard ───────────────────────────────────────────────────────── */

    /// <summary>
    /// The write lock (or the caller's transaction), the approval check and —
    /// when given — the revision check, all inside the lock.
    /// </summary>
    private async Task<(IDbContextTransaction? Transaction, Outcome? Refusal)> GuardAsync(
        int tournamentId, CancellationToken cancellationToken, int? expectedRevision = null, bool deferApproval = false)
    {
        var transaction = db.Database.CurrentTransaction is null
            ? await EmailReservations.BeginExclusiveAsync(db, cancellationToken)
            : null;
        var state = await db.Tournaments.AsNoTracking()
            .Where(t => t.Id == tournamentId)
            .Select(t => new { t.ScheduleApprovedAt, t.ScheduleRevision })
            .FirstOrDefaultAsync(cancellationToken);
        Outcome? refusal = null;
        // A published version does not freeze the schedule: the website keeps showing that version's stored snapshot,
        // while changes go to the working revision (a Draft once the approval is cancelled), which has to be reviewed,
        // approved and explicitly published to replace it.
        if (state is null) refusal = Outcome.NotFound();
        else if (ApprovalChangeReason is { Length: > 500 })
            refusal = Outcome.Invalid("السبب طويل.", "Keep the reason to 500 characters.");
        // Approved but not published: a change needs a written reason and then cancels the approval. Division
        // saves decide themselves (deferApproval), because a no-op save must leave the approval alone.
        else if (state.ScheduleApprovedAt is not null && !deferApproval && string.IsNullOrWhiteSpace(ApprovalChangeReason)) refusal = Frozen();
        else if (expectedRevision is { } expected && expected != state.ScheduleRevision)
            refusal = Refuse(StaleCode,
                "تغيّر الجدول منذ فتح الصفحة. أعد التحميل وراجع التغييرات.",
                $"The schedule changed since this page was loaded (revision {expected}, now {state.ScheduleRevision}). Reload and review before changing it.");
        if (refusal is null) return (transaction, null);
        if (transaction is not null) await transaction.DisposeAsync();
        return (null, refusal);
    }

    /// <summary>
    /// Marks an ACTUAL schedule change: revision + 1, who/when; a review falls
    /// back to draft; and an approved schedule loses its approval (atomically,
    /// in the same transaction as the change) — see <see cref="InvalidateApproval"/>.
    /// </summary>
    private void Touch(Tournament tournament, AdminIdentity.Actor actor)
    {
        if (tournament.ScheduleApprovedAt is not null || tournament.ScheduleStatus == Statuses.Approved)
            InvalidateApproval(tournament, actor);
        tournament.ScheduleRevision++;
        tournament.ScheduleUpdatedAt = DateTime.UtcNow;
        tournament.ScheduleUpdatedBy = actor.Username;
        if (tournament.ScheduleStatus == Statuses.Review)
        {
            tournament.ScheduleStatus = Statuses.Draft;
            tournament.ScheduleSubmittedAt = null;
            tournament.ScheduleSubmittedBy = null;
        }
    }

    /// <summary>
    /// An approved (unpublished) schedule was actually changed: the approval is
    /// cancelled, the schedule is a Draft again (review and approval needed before
    /// publication), and Change History records who changed it, why, and which
    /// approval was cancelled. The approval's own history entry and snapshot stay.
    /// </summary>
    private void InvalidateApproval(Tournament t, AdminIdentity.Actor actor)
    {
        var why = ApprovalChangeReason?.Trim();
        if (string.IsNullOrWhiteSpace(why))
            throw new InvalidOperationException("An approved schedule cannot change without a written reason.");
        audit.Write(actor, AuditActions.ScheduleApprovalInvalidated, "tournament", t.Id, t.NameEn,
            fromStatus: "schedule_approved", toStatus: "schedule_draft",
            details: $"Approval by {t.ScheduleApprovedBy ?? "unknown"} on {t.ScheduleApprovedAt:yyyy-MM-dd HH:mm} UTC (revision {t.ScheduleApprovedRevision}) "
                     + $"cancelled because {actor.Username} changed the approved schedule. Reason: {why}. "
                     + "The schedule is a Draft again and must be reviewed and approved before publication.");
        t.ScheduleStatus = Statuses.Draft;
        t.ScheduleApprovedAt = null;
        t.ScheduleApprovedBy = null;
        t.ScheduleSubmittedAt = null;
        t.ScheduleSubmittedBy = null;
    }

    /* ── loading ─────────────────────────────────────────────────────────── */

    private sealed class Ctx
    {
        public required Tournament Tournament { get; init; }
        public required List<TournamentRing> Rings { get; init; }
        public required List<RingDaySetting> Settings { get; init; }
        public required List<TournamentDivision> Divisions { get; init; }
        public required List<Bout> Bouts { get; init; }
        public required List<ScheduleAthleteException> Exceptions { get; init; }
        public required Dictionary<int, TournamentEntry> Entries { get; init; }
        /// <summary>Every division of the tournament by id → its English label (published or not).</summary>
        public Dictionary<int, string> Labels { get; init; } = [];
        /// <summary>Divisions whose draw exists but is not published (e.g. regenerated as an updated Draft).</summary>
        public HashSet<int> DraftDivisions { get; init; } = [];

        public IReadOnlyList<DateTime> Days => Tournament.Days();

        public (TimeSpan First, int Interval, bool Configured) Timing(DateTime date, int ringId)
        {
            var setting = Settings.FirstOrDefault(s => s.RingId == ringId && s.Date.Date == date.Date);
            if (setting is not null) return (setting.FirstBoutTime, setting.IntervalMinutes, true);
            var ring = Rings.FirstOrDefault(r => r.Id == ringId);
            return (ring?.FirstBoutTime ?? Tournament.FirstBoutTime, ring?.BoutIntervalMinutes ?? DefaultIntervalMinutes, false);
        }
    }

    /// <summary>Everything a schedule decision needs, tracked so the caller can write.</summary>
    private async Task<Ctx> LoadAsync(int tournamentId, CancellationToken cancellationToken)
    {
        var tournament = await db.Tournaments.FirstAsync(t => t.Id == tournamentId, cancellationToken);
        await db.Entry(tournament).ReloadAsync(cancellationToken);
        var rings = await db.TournamentRings.Where(r => r.TournamentId == tournamentId)
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Id).ToListAsync(cancellationToken);
        var settings = await db.RingDaySettings.Where(s => s.TournamentId == tournamentId).ToListAsync(cancellationToken);
        // Only published brackets feed the schedule (REQ-11 rule 1).
        var divisions = await db.TournamentDivisions
            .Where(d => d.TournamentId == tournamentId && d.DrawPublishedAt != null)
            .ToListAsync(cancellationToken);
        var divisionIds = divisions.Select(d => d.Id).ToList();
        var bouts = await db.Bouts.Where(b => divisionIds.Contains(b.DivisionId)).ToListAsync(cancellationToken);
        var exceptions = await db.ScheduleAthleteExceptions
            .Where(x => x.TournamentId == tournamentId).ToListAsync(cancellationToken);
        var entryIds = bouts.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId, b.WinnerEntryId })
            .OfType<int>().Distinct().ToList();
        var entries = await db.TournamentEntries.AsNoTracking()
            .Include(e => e.AthleteRegistration)
            .Where(e => entryIds.Contains(e.Id) || (e.DivisionId != null && divisionIds.Contains(e.DivisionId.Value)))
            .ToDictionaryAsync(e => e.Id, cancellationToken);
        var all = await db.TournamentDivisions.AsNoTracking().Where(d => d.TournamentId == tournamentId).ToListAsync(cancellationToken);
        var drafts = await db.TournamentDivisions.AsNoTracking()
            .Where(d => d.TournamentId == tournamentId && d.DrawPublishedAt == null && db.Bouts.Any(b => b.DivisionId == d.Id))
            .Select(d => d.Id).ToListAsync(cancellationToken);
        return new Ctx
        {
            Tournament = tournament, Rings = rings, Settings = settings, Divisions = divisions,
            Bouts = bouts, Exceptions = exceptions, Entries = entries,
            Labels = all.ToDictionary(d => d.Id, d => d.Describe(false)), DraftDivisions = drafts.ToHashSet(),
        };
    }

    /// <summary>A bout that has to be fought and therefore needs a slot: not a bye, not a walkover.</summary>
    private static bool Fought(Bout b) => !b.IsBye && !b.IsWalkover;

    /// <summary>A bout whose official outcome is recorded: its number, ring, day and time are protected.</summary>
    private static bool Locked(Bout b) => b.WinnerEntryId is not null || b.IsWalkover;

    private static bool Assigned(Bout b) => b.ScheduledDate is not null && b.RingId is not null && b.OrderInRing is not null;

    /* ── recalculation ───────────────────────────────────────────────────── */

    /// <summary>Doubled orders leave room for an inserted bout while a change is being planned.</summary>
    private readonly Dictionary<int, int> pendingOrder = [];

    /// <summary>
    /// Recomputes times and numbers for the given days from the in-memory
    /// queue (each bout's ScheduledDate/RingId/OrderInRing), checks that no
    /// bout with a recorded result would change, and writes only those days.
    /// Numbers and positions are cleared first and then set, so the two unique
    /// indexes never see a transient duplicate.
    /// </summary>
    private async Task<Outcome?> RecalculateAsync(Ctx ctx, IEnumerable<DateTime> days, CancellationToken cancellationToken,
        IReadOnlyDictionary<int, (DateTime? Date, int? Ring, int? Number, TimeSpan? Start)> before)
    {
        var dayset = days.Select(d => d.Date).ToHashSet();
        if (dayset.Count == 0) return null;

        var placements = Plan(ctx, dayset);
        var byBout = placements.ToDictionary(p => p.BoutId);

        // Results are protected: a bout with an official outcome keeps its day, ring, number and time.
        // Only bouts on the days being recalculated can be affected.
        foreach (var bout in ctx.Bouts.Where(Locked))
        {
            if (!before.TryGetValue(bout.Id, out var was) || was.Number is null) continue;
            if (was.Date is not { } wasDay || (!dayset.Contains(wasDay.Date) && !byBout.ContainsKey(bout.Id))) continue;
            var now = byBout.TryGetValue(bout.Id, out var p) ? p : null;
            if (now is null || now.Date != was.Date || now.RingId != was.Ring || now.BoutNumber != was.Number || now.StartTime != was.Start)
            {
                return Refuse("results_locked",
                    "هذا التغيير يغيّر رقم أو موعد نزال سُجّلت نتيجته؛ لم يُحفظ شيء.",
                    $"This change would alter the number, ring, day or time of {BoutRef(ctx, bout.Id)}, which has an official result. Nothing was saved.");
            }
        }

        var affected = ctx.Bouts.Where(b => (b.ScheduledDate is { } d && dayset.Contains(d.Date)) || byBout.ContainsKey(b.Id)).ToList();
        foreach (var bout in affected)
        {
            bout.BoutNumber = null;
            bout.OrderInRing = null;
        }
        await db.SaveChangesAsync(cancellationToken);

        foreach (var bout in affected)
        {
            if (byBout.TryGetValue(bout.Id, out var p))
            {
                bout.ScheduledDate = p.Date;
                bout.RingId = p.RingId;
                bout.OrderInRing = p.OrderInRing;
                bout.StartTime = p.StartTime;
                bout.BoutNumber = p.BoutNumber;
            }
            else
            {
                bout.ScheduledDate = null;
                bout.RingId = null;
                bout.StartTime = null;
            }
        }
        await db.SaveChangesAsync(cancellationToken);
        return null;
    }

    /// <summary>
    /// Bouts whose start time is not after the bout before them in the same ring on the same day (possible only
    /// with an exact time entered by hand). Nothing is reordered: the administrator changes the time or the place.
    /// </summary>
    private static List<Issue> TimeOrderIssues(Ctx ctx, IReadOnlySet<DateTime>? days)
    {
        var issues = new List<Issue>();
        foreach (var queue in ctx.Bouts
                     .Where(b => b.ScheduledDate is not null && b.RingId is not null && b.OrderInRing is not null && b.StartTime is not null)
                     .Where(b => days is null || days.Contains(b.ScheduledDate!.Value.Date))
                     .GroupBy(b => (b.ScheduledDate!.Value.Date, b.RingId!.Value)))
        {
            Bout? previous = null;
            foreach (var b in queue.OrderBy(b => b.OrderInRing).ThenBy(b => b.Id))
            {
                if (previous is not null && b.StartTime <= previous.StartTime)
                {
                    var ring = ctx.Rings.FirstOrDefault(r => r.Id == b.RingId)?.Name ?? "the ring";
                    issues.Add(new Issue("time_order", "blocking",
                        "وقت النزال ليس بعد النزال الذي يسبقه في الحلبة نفسها.",
                        $"{BoutRef(ctx, b.Id)} is set to {b.StartTime:hh\\:mm}, which is not after the bout before it in Ring {ring} on "
                        + $"{queue.Key.Date:dd MMM} ({BoutRef(ctx, previous.Id)} at {previous.StartTime:hh\\:mm}). Enter a later time or choose another place in the ring.",
                        [b.Id, previous.Id], queue.Key.Date, false));
                }
                previous = b;
            }
        }
        return issues;
    }

    /// <summary>The placements the rules give the queues of the given days, from the in-memory state.</summary>
    private List<BoutScheduler.Placement> Plan(Ctx ctx, IReadOnlySet<DateTime> days)
    {
        var queue = ctx.Bouts
            .Where(b => Fought(b) || (b.IsWalkover && b.RingId is not null))
            .Where(b => b.ScheduledDate is { } d && days.Contains(d.Date) && b.RingId is not null)
            .Select(b => new BoutScheduler.QueueItem(
                b.Id, b.ScheduledDate!.Value.Date, b.RingId!.Value,
                pendingOrder.TryGetValue(b.Id, out var o) ? o : (b.OrderInRing ?? int.MaxValue / 2) * 2, b.ManualStartTime))
            .ToList();
        return BoutScheduler.Recalculate(
            queue,
            ctx.Rings.Select(r => new BoutScheduler.RingOrder(r.Id, r.SortOrder)).ToList(),
            (date, ringId) => { var t = ctx.Timing(date, ringId); return (t.First, t.Interval); }).ToList();
    }

    private static Dictionary<int, (DateTime? Date, int? Ring, int? Number, TimeSpan? Start)> Snapshot(Ctx ctx) =>
        ctx.Bouts.ToDictionary(b => b.Id, b => (b.ScheduledDate, b.RingId, b.BoutNumber, b.StartTime));

    /* ── athlete safety ──────────────────────────────────────────────────── */

    /// <summary>Progression-aware safety over the whole tournament, from the in-memory (possibly not yet committed) state.</summary>
    private List<BoutScheduler.SafetyIssue> Safety(Ctx ctx)
    {
        var bracket = ctx.Bouts.Select(b => new BoutScheduler.BracketBout(
            b.Id, b.RedEntryId, b.BlueEntryId, b.IsBye, b.IsWalkover, b.WinnerEntryId, b.WinnerToBoutId, b.WinnerToCorner)).ToList();
        var possible = BoutScheduler.PossibleEntrants(bracket);
        var certain = ctx.Bouts.ToDictionary(b => b.Id, b => new[] { b.RedEntryId, b.BlueEntryId }.OfType<int>().ToHashSet());
        var placements = ctx.Bouts
            .Where(b => Fought(b) && b.ScheduledDate is not null && b.RingId is not null && b.StartTime is not null && b.BoutNumber is not null)
            .Select(b => new BoutScheduler.Placement(b.Id, b.ScheduledDate!.Value.Date, b.RingId!.Value, b.OrderInRing ?? 0,
                b.StartTime!.Value, ctx.Timing(b.ScheduledDate!.Value, b.RingId!.Value).Interval, b.BoutNumber!.Value))
            .ToList();
        int PersonOf(int entryId) => ctx.Entries.TryGetValue(entryId, out var e) ? e.AthleteRegistrationId : -entryId;
        int Allowed(int person, DateTime date) =>
            ctx.Exceptions.Where(x => x.IsActive && x.AthleteRegistrationId == person && x.Date.Date == date.Date)
                .Select(x => x.MaxBouts).DefaultIfEmpty(BoutScheduler.DefaultBoutsPerAthletePerDay).Max();
        return BoutScheduler.CheckAthletes(placements, possible, certain, PersonOf, Allowed);
    }

    private static string KeyOf(BoutScheduler.SafetyIssue i) =>
        $"{i.Kind}|{i.PersonId}|{i.Date:yyyy-MM-dd}|{string.Join(",", i.BoutIds.OrderBy(x => x))}";

    /// <summary>The safety issues present after a change that were not there before it.</summary>
    private static List<BoutScheduler.SafetyIssue> Introduced(List<BoutScheduler.SafetyIssue> before, List<BoutScheduler.SafetyIssue> after)
    {
        var old = before.Select(KeyOf).ToHashSet();
        return after.Where(i => !old.Contains(KeyOf(i))).ToList();
    }

    private Outcome SafetyRefusal(Ctx ctx, List<BoutScheduler.SafetyIssue> issues)
    {
        var lines = issues.Take(5).Select(i => DescribeIssue(ctx, i).En).ToList();
        return Refuse("athlete_conflict",
            "هذا التغيير يخالف قواعد سلامة اللاعبين (عدد النزالات اليومي أو الراحة أو التداخل)؛ لم يُحفظ شيء.",
            "This change breaks the athlete-safety rules, so nothing was saved: " + string.Join(" ", lines)
            + (issues.Count > 5 ? $" (+{issues.Count - 5} more)" : string.Empty));
    }

    private static string PersonName(Ctx ctx, int person)
    {
        var entry = ctx.Entries.Values.FirstOrDefault(e => e.AthleteRegistrationId == person);
        return entry is null ? $"Athlete #{person}" : DrawService.DisplayName(entry, false) ?? $"Athlete #{person}";
    }

    private static string BoutRef(Ctx ctx, int boutId)
    {
        var b = ctx.Bouts.FirstOrDefault(x => x.Id == boutId);
        if (b is null) return $"bout {boutId}";
        var ring = ctx.Rings.FirstOrDefault(r => r.Id == b.RingId)?.Name ?? "unassigned";
        // Never the internal day-queue key: the official number once published, otherwise the bracket reference.
        var label = b.OfficialBoutNumber is { } official ? $"Bout #{official}"
            : $"{ctx.Divisions.FirstOrDefault(d => d.Id == b.DivisionId)?.Describe(false) ?? "Division"} round {b.Round} · match {b.Position}";
        return b.BoutNumber is not null ? $"{label} ({ring}, {b.ScheduledDate:dd MMM} {b.StartTime:hh\\:mm})" : $"{label} (unscheduled)";
    }

    private static (string Ar, string En) DescribeIssue(Ctx ctx, BoutScheduler.SafetyIssue i)
    {
        var who = PersonName(ctx, i.PersonId);
        var bouts = string.Join(", ", i.BoutIds.Select(id => BoutRef(ctx, id)));
        var maybe = i.Potential ? " — a possible participant: the bracket path can bring this athlete to these bouts" : string.Empty;
        return i.Kind switch
        {
            "overlap" => ($"{who}: نزالان متداخلان في {i.Date:yyyy-MM-dd}: {bouts}.",
                $"{who}: overlapping bouts on {i.Date:dd MMM yyyy}: {bouts}{maybe}."),
            "rest" => ($"{who}: راحة {i.Minutes} دقيقة فقط بين النزالين ({bouts})، والمطلوب {BoutScheduler.MinRestMinutes}.",
                $"{who}: only {i.Minutes} min rest between {bouts} (at least {BoutScheduler.MinRestMinutes} required; a bout is counted as occupying its whole ring interval){maybe}."),
            "max_three" => ($"{who}: {i.Count} نزالات في {i.Date:yyyy-MM-dd}، والحد الأقصى 3 حتى مع الاستثناء.",
                $"{who}: {i.Count} bouts on {i.Date:dd MMM yyyy} — never more than 3, even with an exception: {bouts}{maybe}."),
            _ => ($"{who}: {i.Count} نزالات في {i.Date:yyyy-MM-dd} والمسموح {i.Allowed}.",
                $"{who}: {i.Count} bouts on {i.Date:dd MMM yyyy}, {i.Allowed} allowed{(i.Allowed == 1 ? " (more needs an authorised exception)" : string.Empty)}: {bouts}{maybe}."),
        };
    }

    /* ── source bracket tracking ─────────────────────────────────────────── */

    /// <summary>
    /// A division's bracket as the schedule depends on it: which bouts exist
    /// (id, round, position, bye/walkover) and who was drawn into round one.
    /// Later-round corners are left out — they fill through normal progression,
    /// which must not invalidate a schedule.
    /// </summary>
    private static Dictionary<string, string> SourceSignature(Ctx ctx) =>
        ctx.Divisions.ToDictionary(
            d => d.Id.ToString(),
            d => string.Join(";", ctx.Bouts.Where(b => b.DivisionId == d.Id).OrderBy(b => b.Round).ThenBy(b => b.Position)
                .Select(b => $"{b.Id}:{b.Round}:{b.Position}:{(b.IsBye ? "B" : b.IsWalkover ? "W" : "F")}"
                             + (b.Round == 1 ? $":{b.RedEntryId}:{b.BlueEntryId}" : string.Empty))));

    public sealed record SourceChange(int DivisionId, string Label, string Kind, IReadOnlyList<int> AddedBoutIds,
        IReadOnlyList<int> RemovedBoutIds, IReadOnlyList<int> ChangedBoutIds);

    /// <summary>A source change that still needs the administrator: a bracket added or changed (review and save the
    /// division's schedule), or an updated draw not published yet. A division whose draw no longer exists does not.</summary>
    private static bool NeedsReview(SourceChange c) => c.Kind is "added" or "changed" or "unpublished";

    /// <summary>
    /// The accepted source after saving one division: that division's current bracket is accepted (the administrator
    /// reviewed and saved its bouts), and references to divisions that no longer have any draw are dropped. A
    /// division whose updated draw is still a Draft keeps its previous entry, so it keeps blocking until it is
    /// published and scheduled.
    /// </summary>
    private static string AcceptSource(Ctx ctx, int? divisionId)
    {
        var accepted = string.IsNullOrEmpty(ctx.Tournament.ScheduleSourceSnapshot)
            ? new Dictionary<string, string>()
            : JsonSerializer.Deserialize<Dictionary<string, string>>(ctx.Tournament.ScheduleSourceSnapshot!) ?? [];
        var now = SourceSignature(ctx);
        foreach (var key in accepted.Keys.ToList())
            if (!now.ContainsKey(key) && !ctx.DraftDivisions.Contains(int.Parse(key))) accepted.Remove(key);
        if (divisionId is { } id && now.TryGetValue(id.ToString(), out var sig)) accepted[id.ToString()] = sig;
        return JsonSerializer.Serialize(accepted);
    }

    private static List<SourceChange> SourceChanges(Ctx ctx)
    {
        if (ctx.Tournament.ScheduleStatus is null) return [];
        var then = string.IsNullOrEmpty(ctx.Tournament.ScheduleSourceSnapshot)
            ? new Dictionary<string, string>()
            : JsonSerializer.Deserialize<Dictionary<string, string>>(ctx.Tournament.ScheduleSourceSnapshot!) ?? [];
        var now = SourceSignature(ctx);
        var changes = new List<SourceChange>();
        static Dictionary<int, string> Parse(string s) => s.Length == 0 ? [] :
            s.Split(';').ToDictionary(x => int.Parse(x.Split(':')[0]), x => x);
        foreach (var key in then.Keys.Union(now.Keys))
        {
            var id = int.Parse(key);
            var label = ctx.Labels.TryGetValue(id, out var l) ? l : "A division that no longer exists";
            if (!then.TryGetValue(key, out var a))
            {
                changes.Add(new SourceChange(id, label, "added", Parse(now[key]).Keys.ToList(), [], []));
                continue;
            }
            if (!now.TryGetValue(key, out var b))
            {
                // Out of the source because its updated draw is a Draft not yet published ("unpublished"), or because
                // the division no longer has a draw at all ("removed" — an outdated reference, nothing to review).
                changes.Add(new SourceChange(id, label, ctx.DraftDivisions.Contains(id) ? "unpublished" : "removed",
                    [], Parse(a).Keys.ToList(), []));
                continue;
            }
            if (a == b) continue;
            var pa = Parse(a);
            var pb = Parse(b);
            changes.Add(new SourceChange(id, label, "changed",
                pb.Keys.Except(pa.Keys).ToList(), pa.Keys.Except(pb.Keys).ToList(),
                pa.Keys.Intersect(pb.Keys).Where(k => pa[k] != pb[k]).ToList()));
        }
        return changes;
    }

    /* ── validation (Review) ─────────────────────────────────────────────── */

    /// <param name="Subject">Who or what the issue is about (the athlete or division), for grouping on screen.</param>
    public sealed record Issue(string Code, string Severity, string MessageAr, string MessageEn,
        IReadOnlyList<int> BoutIds, DateTime? Date, bool Potential, string? Subject = null);

    private List<Issue> Validate(Ctx ctx)
    {
        var issues = new List<Issue>();
        var days = ctx.Days.Select(d => d.Date).ToHashSet();

        var changes = SourceChanges(ctx);
        foreach (var c in changes.Where(c => c.Kind == "unpublished"))
            issues.Add(new Issue("draw_unpublished", "blocking",
                $"لم تُنشر القرعة المحدّثة لفئة {c.Label} بعد؛ انشرها من صفحة تحضير القرعة ثم جدول نزالاتها.",
                $"The updated {c.Label} draw is not published yet. Publish it in Draw Preparation, then schedule its bouts.",
                [], null, false, c.Label));
        var review = changes.Where(c => c.Kind is "added" or "changed").ToList();
        if (review.Count > 0)
        {
            issues.Add(new Issue("source_changed", "blocking",
                "تغيّرت القرعة المصدر منذ آخر مراجعة للجدول؛ راجع جدول الفئة واحفظه.",
                $"The draw changed for {string.Join(", ", review.Select(c => c.Label))} since the schedule last accepted it. Review and save that division's schedule.",
                review.SelectMany(c => c.ChangedBoutIds.Concat(c.AddedBoutIds)).ToList(), null, false));
        }
        foreach (var c in changes.Where(c => c.Kind == "removed"))
            issues.Add(new Issue("source_removed", "warning",
                $"لم تعد لفئة {c.Label} قرعة؛ نزالاتها لم تعد ضمن الجدول.",
                $"{c.Label} no longer has a draw; its bouts are no longer part of the schedule.", [], null, false, c.Label));

        var fought = ctx.Bouts.Where(Fought).ToList();
        if (fought.Count == 0)
            issues.Add(new Issue("no_bouts", "blocking", "لا توجد نزالات منشورة لجدولتها.", "There are no bouts from published brackets to schedule.", [], null, false));

        var unassigned = fought.Where(b => !Assigned(b)).ToList();
        if (unassigned.Count > 0)
        {
            issues.Add(new Issue("unscheduled", "blocking",
                $"{unassigned.Count} نزال/نزالات لم تُجدول بعد.",
                $"{unassigned.Count} bout(s) from published brackets have no day and ring yet.",
                unassigned.Select(b => b.Id).ToList(), null, false));
        }

        foreach (var b in fought.Where(Assigned))
        {
            if (!days.Contains(b.ScheduledDate!.Value.Date))
                issues.Add(new Issue("outside_dates", "blocking", "نزال خارج أيام البطولة.",
                    $"Bout {BoutRef(ctx, b.Id)} is on {b.ScheduledDate:dd MMM yyyy}, outside the tournament days.", [b.Id], b.ScheduledDate, false));
            var ring = ctx.Rings.FirstOrDefault(r => r.Id == b.RingId);
            if (ring is null || !ring.IsActive)
                issues.Add(new Issue("inactive_ring", "blocking", "نزال على حلبة غير مفعّلة.",
                    $"Bout {BoutRef(ctx, b.Id)} is on a ring that is not active.", [b.Id], b.ScheduledDate, false));
        }

        // Numbering and times must be exactly what the rules produce from the stored queues.
        var assignedDays = ctx.Bouts.Where(b => b.ScheduledDate is not null && b.RingId is not null).Select(b => b.ScheduledDate!.Value.Date).ToHashSet();
        var expected = Plan(ctx, assignedDays).ToDictionary(p => p.BoutId);
        var drift = ctx.Bouts.Where(b => expected.TryGetValue(b.Id, out var p)
            && (p.BoutNumber != b.BoutNumber || p.StartTime != b.StartTime || p.OrderInRing != b.OrderInRing)).Select(b => b.Id).ToList();
        if (drift.Count > 0)
            issues.Add(new Issue("numbering", "blocking", "الترقيم أو الأوقات تحتاج إلى إعادة حساب.",
                $"{drift.Count} bout(s) do not carry the number, position or time the rules give them; recalculate the schedule.", drift, null, false));
        issues.AddRange(TimeOrderIssues(ctx, null));
        foreach (var day in ctx.Bouts.Where(b => b.BoutNumber is not null && b.ScheduledDate is not null).GroupBy(b => b.ScheduledDate!.Value.Date))
        {
            var numbers = day.Select(b => b.BoutNumber!.Value).OrderBy(n => n).ToList();
            if (numbers.Distinct().Count() != numbers.Count || numbers.First() != 1 || numbers.Last() != numbers.Count)
                issues.Add(new Issue("numbering", "blocking", "أرقام النزالات غير متسلسلة في هذا اليوم.",
                    $"Bout numbers on {day.Key:dd MMM yyyy} are not 1..{numbers.Count} without gaps or duplicates.", [], day.Key, false));
        }

        foreach (var (date, ringId) in fought.Where(Assigned).Select(b => (b.ScheduledDate!.Value.Date, b.RingId!.Value)).Distinct())
        {
            var t = ctx.Timing(date, ringId);
            if (!t.Configured)
            {
                var ring = ctx.Rings.FirstOrDefault(r => r.Id == ringId)?.Name ?? $"Ring {ringId}";
                issues.Add(new Issue("timing_default", "warning", "توقيت الحلبة لهذا اليوم غير مُعدّ؛ تُستخدم القيم الافتراضية.",
                    $"{ring} on {date:dd MMM yyyy} has no timing of its own; the default {t.First:hh\\:mm} every {t.Interval} min is used.", [], date, false));
            }
        }

        foreach (var s in Safety(ctx))
        {
            var (ar, en) = DescribeIssue(ctx, s);
            issues.Add(new Issue("athlete_" + s.Kind, "blocking", ar, en, s.BoutIds, s.Date, s.Potential, PersonName(ctx, s.PersonId)));
        }

        return issues;
    }

    /* ── Stage 5 operations ──────────────────────────────────────────────── */

    private static Outcome NeedsDraft() => Refuse("no_schedule", "أنشئ مسودة الجدول أولًا.", "Create the schedule Draft first.");

    /// <summary>Creates the Draft from the published brackets (B01/B02).</summary>
    public async Task<Outcome> CreateDraftAsync(int tournamentId, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is not null)
            return Refuse("exists", "يوجد جدول لهذه البطولة.", "This tournament already has a schedule.");
        if (!ctx.Bouts.Any(Fought))
            return Refuse("no_published_bracket",
                "لا توجد قرعة منشورة؛ لا يمكن إنشاء الجدول قبل نشر قرعة واحدة على الأقل.",
                "No bracket is published yet. A schedule can only be created from published brackets.");

        var t = ctx.Tournament;
        t.ScheduleStatus = Statuses.Draft;
        t.ScheduleRevision = Math.Max(1, t.ScheduleRevision + 1);
        t.ScheduleCreatedAt = DateTime.UtcNow;
        t.ScheduleCreatedBy = actor.Username;
        t.ScheduleUpdatedAt = DateTime.UtcNow;
        t.ScheduleUpdatedBy = actor.Username;
        t.ScheduleSourceSnapshot = JsonSerializer.Serialize(SourceSignature(ctx));
        audit.Write(actor, AuditActions.ScheduleCreated, "tournament", t.Id, t.NameEn, toStatus: Statuses.Draft,
            details: $"Draft created from {ctx.Divisions.Count} published bracket(s), {ctx.Bouts.Count(Fought)} bout(s) to schedule.");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    /* rings */

    public async Task<(Outcome Result, TournamentRing? Ring)> AddRingAsync(
        Tournament tournament, string name, TimeSpan? firstBoutTime, int? intervalMinutes,
        AdminIdentity.Actor actor, CancellationToken cancellationToken = default, int? expectedRevision = null)
    {
        var clean = (name ?? string.Empty).Trim();
        if (clean.Length is 0 or > 60) return (Outcome.Invalid("اسم الحلبة مطلوب.", "A ring needs a name (up to 60 characters)."), null);
        if (intervalMinutes is { } iv && iv is < BoutScheduler.MinIntervalMinutes or > BoutScheduler.MaxIntervalMinutes)
            return (Outcome.Invalid("الفاصل غير صالح.", $"The interval must be between {BoutScheduler.MinIntervalMinutes} and {BoutScheduler.MaxIntervalMinutes} minutes."), null);

        var (transaction, refused) = await GuardAsync(tournament.Id, cancellationToken, expectedRevision);
        if (refused is not null) return (refused, null);
        await using var _ = transaction;

        if (await db.TournamentRings.AnyAsync(r => r.TournamentId == tournament.Id && r.Name == clean, cancellationToken))
            return (Outcome.Conflict("يوجد حلبة بهذا الاسم.", "A ring with that name already exists."), null);
        var order = await db.TournamentRings.Where(r => r.TournamentId == tournament.Id)
            .Select(r => (int?)r.SortOrder).MaxAsync(cancellationToken) ?? 0;

        var ring = new TournamentRing
        {
            TournamentId = tournament.Id, Name = clean, FirstBoutTime = firstBoutTime,
            BoutIntervalMinutes = intervalMinutes, SortOrder = order + 1,
        };
        db.TournamentRings.Add(ring);
        var t = await db.Tournaments.FirstAsync(x => x.Id == tournament.Id, cancellationToken);
        if (t.ScheduleStatus is not null) Touch(t, actor);
        audit.Write(actor, AuditActions.ScheduleRingChanged, "tournament", tournament.Id, details: $"Ring added: {clean} (position {order + 1}).");
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return (Outcome.Success(), ring);
    }

    /// <summary>Renames a ring, (de)activates it, or moves it up/down — the order that drives numbering.</summary>
    public async Task<Outcome> UpdateRingStage5Async(int tournamentId, int ringId, string? name, bool? isActive, int? moveBy,
        int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        var ring = ctx.Rings.FirstOrDefault(r => r.Id == ringId);
        if (ring is null) return Outcome.NotFound();
        var notes = new List<string>();
        var before = Snapshot(ctx);

        if (!string.IsNullOrWhiteSpace(name) && name.Trim() != ring.Name)
        {
            var clean = name.Trim();
            if (clean.Length > 60) return Outcome.Invalid("الاسم طويل.", "Keep a ring name to 60 characters.");
            if (ctx.Rings.Any(r => r.Id != ringId && r.Name == clean)) return Outcome.Conflict("يوجد حلبة بهذا الاسم.", "A ring with that name already exists.");
            notes.Add($"renamed {ring.Name} → {clean}");
            ring.Name = clean;
        }

        if (isActive is { } active && active != ring.IsActive)
        {
            if (!active && ctx.Bouts.Any(b => b.RingId == ringId && b.BoutNumber is not null))
                return Refuse("ring_in_use", "لا يمكن إيقاف حلبة عليها نزالات؛ انقلها أولًا.",
                    $"{ring.Name} holds scheduled bouts. Move them to another ring before deactivating it.");
            ring.IsActive = active;
            notes.Add(active ? "activated" : "deactivated");
        }

        if (moveBy is { } step && step != 0)
        {
            var ordered = ctx.Rings.OrderBy(r => r.SortOrder).ThenBy(r => r.Id).ToList();
            var index = ordered.IndexOf(ring);
            var target = Math.Clamp(index + Math.Sign(step), 0, ordered.Count - 1);
            if (target != index)
            {
                ordered.RemoveAt(index);
                ordered.Insert(target, ring);
                for (var i = 0; i < ordered.Count; i++) ordered[i].SortOrder = i + 1;
                notes.Add($"moved to position {target + 1}");
                // Ring order drives numbering on every day that has bouts.
                var days = ctx.Bouts.Where(b => b.ScheduledDate is not null && b.RingId is not null).Select(b => b.ScheduledDate!.Value.Date).Distinct().ToList();
                var locked = await RecalculateAsync(ctx, days, ct, before);
                if (locked is not null) return locked;
            }
        }

        if (notes.Count == 0) return Outcome.Success();
        if (ctx.Tournament.ScheduleStatus is not null) Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleRingChanged, "tournament", tournamentId, details: $"Ring {ring.Name}: {string.Join(", ", notes)}.");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    public async Task<Outcome> RemoveRingAsync(TournamentRing ring, AdminIdentity.Actor actor, CancellationToken cancellationToken = default,
        int? expectedRevision = null)
    {
        var (transaction, refused) = await GuardAsync(ring.TournamentId, cancellationToken, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        if (await db.Bouts.AnyAsync(b => b.RingId == ring.Id, cancellationToken))
            return Refuse("ring_in_use", "لا يمكن حذف حلبة عليها نزالات؛ انقلها أولًا.",
                "This ring has bouts on it; move them before removing it.");
        db.RingDaySettings.RemoveRange(db.RingDaySettings.Where(s => s.RingId == ring.Id));
        db.TournamentRings.Remove(ring);
        var t = await db.Tournaments.FirstAsync(x => x.Id == ring.TournamentId, cancellationToken);
        if (t.ScheduleStatus is not null) Touch(t, actor);
        audit.Write(actor, AuditActions.ScheduleRingChanged, "tournament", ring.TournamentId, details: $"Ring removed: {ring.Name}.");
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Outcome.Success();
    }

    /* ring/day timing */

    public async Task<Outcome> SetRingDayAsync(int tournamentId, int ringId, DateTime date, TimeSpan firstBoutTime,
        int intervalMinutes, int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        if (intervalMinutes is < BoutScheduler.MinIntervalMinutes or > BoutScheduler.MaxIntervalMinutes)
            return Outcome.Invalid("الفاصل غير صالح.", $"The interval must be a whole number of minutes between {BoutScheduler.MinIntervalMinutes} and {BoutScheduler.MaxIntervalMinutes}.");
        if (firstBoutTime < TimeSpan.Zero || firstBoutTime >= TimeSpan.FromDays(1))
            return Outcome.Invalid("وقت البداية غير صالح.", "The first bout time must be a time of day.");

        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is null) return NeedsDraft();
        if (!ctx.Days.Contains(date.Date))
            return Refuse("outside_dates", "التاريخ خارج أيام البطولة.",
                $"{date:dd MMM yyyy} is not a day of this tournament ({ctx.Tournament.StartDate:dd MMM} – {ctx.Tournament.EndDate:dd MMM yyyy}).", 400);
        var ring = ctx.Rings.FirstOrDefault(r => r.Id == ringId);
        if (ring is null) return Outcome.NotFound();

        var before = Snapshot(ctx);
        var safetyBefore = Safety(ctx);
        var setting = ctx.Settings.FirstOrDefault(s => s.RingId == ringId && s.Date.Date == date.Date);
        var was = setting is null ? "default" : $"{setting.FirstBoutTime:hh\\:mm} every {setting.IntervalMinutes} min";
        if (setting is null)
        {
            setting = new RingDaySetting { TournamentId = tournamentId, RingId = ringId, Date = date.Date };
            db.RingDaySettings.Add(setting);
            ctx.Settings.Add(setting);
        }
        setting.FirstBoutTime = firstBoutTime;
        setting.IntervalMinutes = intervalMinutes;
        setting.UpdatedAt = DateTime.UtcNow;
        setting.UpdatedBy = actor.Username;

        var locked = await RecalculateAsync(ctx, [date.Date], ct, before);
        if (locked is not null) return locked;
        var introduced = Introduced(safetyBefore, Safety(ctx));
        if (introduced.Count > 0) return SafetyRefusal(ctx, introduced);

        Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleTimingChanged, "tournament", tournamentId,
            details: $"{ring.Name} on {date:yyyy-MM-dd}: {was} → {firstBoutTime:hh\\:mm} every {intervalMinutes} min. Times recalculated for that day.");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    /* division assignment */

    /// <summary>
    /// The division-level setup: the chosen rounds' unscheduled bouts join the
    /// end of one ring's queue on one day, in bracket order. The ring becomes
    /// the division's default (a default, not a restriction — single bouts can
    /// move later without changing it).
    /// </summary>
    public async Task<(Outcome Result, int Assigned)> AssignDivisionAsync(int tournamentId, int divisionId, int ringId, DateTime date,
        IReadOnlyCollection<int>? rounds, int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return (refused, 0);
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is null) return (NeedsDraft(), 0);
        var division = ctx.Divisions.FirstOrDefault(d => d.Id == divisionId);
        if (division is null)
            return (Refuse("not_published", "قرعة هذه الفئة غير منشورة.", "This division's bracket is not published, so its bouts cannot be scheduled."), 0);
        if (!ctx.Days.Contains(date.Date))
            return (Refuse("outside_dates", "التاريخ خارج أيام البطولة.", $"{date:dd MMM yyyy} is not a day of this tournament.", 400), 0);
        var ring = ctx.Rings.FirstOrDefault(r => r.Id == ringId);
        if (ring is null || !ring.IsActive)
            return (Refuse("inactive_ring", "الحلبة غير متاحة.", "Choose an active ring of this tournament."), 0);

        var wanted = ctx.Bouts.Where(b => b.DivisionId == divisionId && Fought(b) && !Assigned(b)
                                          && (rounds is null || rounds.Count == 0 || rounds.Contains(b.Round)))
            .OrderBy(b => b.Round).ThenBy(b => b.Position).ToList();
        if (wanted.Count == 0)
            return (Outcome.Invalid("لا توجد نزالات غير مجدولة في الأدوار المختارة.", "The chosen rounds have no unscheduled bouts."), 0);

        var before = Snapshot(ctx);
        var safetyBefore = Safety(ctx);
        var tail = ctx.Bouts.Where(b => b.ScheduledDate?.Date == date.Date && b.RingId == ringId && b.OrderInRing is not null)
            .Select(b => b.OrderInRing!.Value).DefaultIfEmpty(0).Max();
        foreach (var bout in wanted)
        {
            bout.ScheduledDate = date.Date;
            bout.RingId = ringId;
            bout.ManualStartTime = null;
            pendingOrder[bout.Id] = (++tail) * 2;
        }
        division.DefaultRingId ??= ringId;
        division.ScheduledDate ??= date.Date;

        var locked = await RecalculateAsync(ctx, [date.Date], ct, before);
        pendingOrder.Clear();
        if (locked is not null) return (locked, 0);
        var introduced = Introduced(safetyBefore, Safety(ctx));
        if (introduced.Count > 0) return (SafetyRefusal(ctx, introduced), 0);

        Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleBoutsAssigned, "tournament_division", divisionId, division.Describe(false),
            details: $"{wanted.Count} bout(s) of round(s) {string.Join(", ", wanted.Select(b => b.Round).Distinct())} assigned to {ring.Name} on {date:yyyy-MM-dd}: "
                     + string.Join(", ", wanted.Select(b => BoutRef(ctx, b.Id))) + ".");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return (Outcome.Success(), wanted.Count);
    }

    /* move / reorder / unassign */

    /// <summary>
    /// Moves one bout to a day, ring and position (1-based in the destination
    /// queue; null = the end). Within the same ring and day this is a reorder.
    /// Both queues are renumbered and retimed; no other day is touched.
    /// </summary>
    public async Task<Outcome> MoveBoutStage5Async(int tournamentId, int boutId, DateTime date, int ringId, int? position,
        string? reason, int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var why = reason?.Trim();
        if (why is { Length: > 500 }) return Outcome.Invalid("السبب طويل.", "Keep the reason to 500 characters.");

        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is null) return NeedsDraft();
        var bout = ctx.Bouts.FirstOrDefault(b => b.Id == boutId);
        if (bout is null) return Outcome.NotFound();
        if (bout.IsBye && !bout.IsWalkover)
            return Refuse("bye", "الإعفاء ليس نزالًا ولا يُجدول.", "A BYE is not a bout: it never takes a slot.");
        if (Locked(bout))
            return Refuse("results_locked", "سُجّلت نتيجة هذا النزال؛ لا يمكن نقله.",
                "This bout has an official result (or a walkover); its slot is protected.");
        if (!ctx.Days.Contains(date.Date))
            return Refuse("outside_dates", "التاريخ خارج أيام البطولة.", $"{date:dd MMM yyyy} is not a day of this tournament.", 400);
        var ring = ctx.Rings.FirstOrDefault(r => r.Id == ringId);
        if (ring is null || !ring.IsActive) return Refuse("inactive_ring", "الحلبة غير متاحة.", "Choose an active ring of this tournament.");

        var crossing = Assigned(bout) && (bout.RingId != ringId || bout.ScheduledDate!.Value.Date != date.Date);
        if (crossing && !actor.Has(AdminPermissions.TournamentScheduleCrossRing))
            return Refuse("cross_ring_forbidden", "نقل النزال إلى حلبة أو يوم آخر من صلاحية المندوب الفني.",
                $"Moving a bout to another ring or day needs the '{AdminPermissions.TournamentScheduleCrossRing}' permission (the Technical Delegate's authority).", 403);
        if (crossing && string.IsNullOrWhiteSpace(why))
            return Outcome.Invalid("يجب ذكر سبب نقل النزال.", "A reason is required to move a bout to another ring or day.");

        var before = Snapshot(ctx);
        var safetyBefore = Safety(ctx);
        var from = Assigned(bout) ? BoutRef(ctx, bout.Id) : "unscheduled";
        var oldDay = bout.ScheduledDate?.Date;

        // The destination queue without the bout, in order; the bout goes in at the requested position.
        var destination = ctx.Bouts
            .Where(b => b.Id != bout.Id && b.ScheduledDate?.Date == date.Date && b.RingId == ringId && b.OrderInRing is not null)
            .OrderBy(b => b.OrderInRing).ThenBy(b => b.Id).ToList();
        var index = Math.Clamp((position ?? destination.Count + 1) - 1, 0, destination.Count);
        destination.Insert(index, bout);
        for (var i = 0; i < destination.Count; i++) pendingOrder[destination[i].Id] = (i + 1) * 2;
        bout.ScheduledDate = date.Date;
        bout.RingId = ringId;
        bout.ManualStartTime = null; // moved by hand to a slot: it takes that slot's time
        if (crossing) bout.RingPinned = true;

        var days = new List<DateTime> { date.Date };
        if (oldDay is { } d && d != date.Date) days.Add(d);
        var locked = await RecalculateAsync(ctx, days, ct, before);
        pendingOrder.Clear();
        if (locked is not null) return locked;
        var introduced = Introduced(safetyBefore, Safety(ctx));
        if (introduced.Count > 0) return SafetyRefusal(ctx, introduced);

        Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleBoutMoved, "bout", bout.Id,
            $"{ctx.Divisions.First(x => x.Id == bout.DivisionId).Describe(false)} · round {bout.Round}",
            fromStatus: from, toStatus: BoutRef(ctx, bout.Id),
            details: $"{(crossing ? "Moved" : from == "unscheduled" ? "Scheduled" : "Reordered")}: {from} → {BoutRef(ctx, bout.Id)}. "
                     + $"Renumbered: {string.Join(", ", days.Select(x => x.ToString("yyyy-MM-dd")))} only."
                     + (string.IsNullOrWhiteSpace(why) ? string.Empty : $" Reason: {why}"));
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    public async Task<Outcome> UnassignBoutAsync(int tournamentId, int boutId, string? reason, int expectedRevision,
        AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        var bout = ctx.Bouts.FirstOrDefault(b => b.Id == boutId);
        if (bout is null) return Outcome.NotFound();
        if (Locked(bout)) return Refuse("results_locked", "سُجّلت نتيجة هذا النزال.", "This bout has an official result; its slot is protected.");
        if (!Assigned(bout)) return Outcome.Success();
        var before = Snapshot(ctx);
        var from = BoutRef(ctx, bout.Id);
        var day = bout.ScheduledDate!.Value.Date;
        bout.ScheduledDate = null;
        bout.RingId = null;
        bout.OrderInRing = null;
        bout.StartTime = null;
        bout.ManualStartTime = null;
        bout.BoutNumber = null;
        var locked = await RecalculateAsync(ctx, [day], ct, before);
        if (locked is not null) return locked;
        Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleBoutMoved, "bout", bout.Id, fromStatus: from, toStatus: "unscheduled",
            details: $"Returned to unscheduled: {from}. {day:yyyy-MM-dd} renumbered." + (string.IsNullOrWhiteSpace(reason) ? string.Empty : $" Reason: {reason.Trim()}"));
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    /* division schedule (Stage 5 Division Schedule page) */

    /// <param name="Time">An exact start time for this bout, or null for the time its place in the ring gives it.</param>
    public sealed record DivisionBoutPlan(int BoutId, int RingId, DateTime Date, int Position, TimeSpan? Time = null);
    public sealed record DivisionTimingPlan(int RingId, DateTime Date, TimeSpan FirstBoutTime, int IntervalMinutes);

    public sealed record DivisionSaveResult(
        IReadOnlyList<object> Bouts, IReadOnlyList<object> OthersAffected, IReadOnlyList<object> TimingChanges,
        int Crossing, bool CreatesSchedule, bool NeedsConfirmation, bool ChangesSchedule = false, bool InvalidatesApproval = false);

    public const string ConfirmRequiredCode = "confirm_required";

    /// <summary>
    /// Save Division Schedule: one division's complete plan — every bout to
    /// fight with its ring, day and place in that ring's day queue (its time) —
    /// plus any ring/day timing the division settings change, applied in ONE
    /// guarded transaction through the existing engine (queue merge,
    /// recalculation of every affected day, results lock, progression-aware
    /// athlete safety). Nothing else is ever moved: other divisions keep their
    /// relative order; when their times or numbers shift as a consequence, or a
    /// shared ring/day timing changes, the save needs <paramref name="confirm"/>.
    /// Moving an already scheduled bout to another ring or day keeps needing
    /// the cross-ring permission and a reason. <paramref name="dryRun"/> runs
    /// everything and rolls back, returning the preview. A successful save marks
    /// the division as explicitly saved; it never submits, approves or publishes.
    /// </summary>
    public async Task<(Outcome Result, DivisionSaveResult? Preview, IReadOnlyList<Issue> Issues)> SaveDivisionAsync(
        int tournamentId, int divisionId, IReadOnlyList<DivisionBoutPlan> plan, IReadOnlyList<DivisionTimingPlan> timing,
        int? defaultRingId, string? reason, bool confirm, bool dryRun, int expectedRevision, AdminIdentity.Actor actor,
        CancellationToken ct = default)
    {
        var why = reason?.Trim();
        if (why is { Length: > 500 }) return (Outcome.Invalid("السبب طويل.", "Keep the reason to 500 characters."), null, []);
        foreach (var tp in timing)
        {
            if (tp.IntervalMinutes is < BoutScheduler.MinIntervalMinutes or > BoutScheduler.MaxIntervalMinutes)
                return (Outcome.Invalid("الفاصل غير صالح.", $"The bout interval must be between {BoutScheduler.MinIntervalMinutes} and {BoutScheduler.MaxIntervalMinutes} minutes."), null, []);
            if (tp.FirstBoutTime < TimeSpan.Zero || tp.FirstBoutTime >= TimeSpan.FromDays(1))
                return (Outcome.Invalid("وقت البداية غير صالح.", "The first bout start time must be a time of day."), null, []);
        }
        if (plan.GroupBy(p => p.BoutId).Any(g => g.Count() > 1))
            return (Outcome.Invalid("نزال مكرر في الخطة.", "A bout appears more than once in the plan."), null, []);

        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision, deferApproval: true);
        if (refused is not null) return (refused, null, []);
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        var t = ctx.Tournament;
        var wasApproved = t.ScheduleApprovedAt is not null;
        var division = ctx.Divisions.FirstOrDefault(d => d.Id == divisionId);
        if (division is null)
            return (Refuse("not_published", "قرعة هذه الفئة غير منشورة.", "This division's bracket is not published, so its bouts cannot be scheduled."), null, []);

        var mine = ctx.Bouts.Where(b => b.DivisionId == divisionId && Fought(b)).OrderBy(b => b.Round).ThenBy(b => b.Position).ToList();
        if (mine.Count == 0) return (Outcome.Invalid("لا توجد نزالات لجدولتها.", "This division has no bouts to schedule."), null, []);
        var planned = plan.ToDictionary(p => p.BoutId);
        foreach (var p in plan)
        {
            var bout = ctx.Bouts.FirstOrDefault(b => b.Id == p.BoutId && b.DivisionId == divisionId);
            if (bout is null) return (Outcome.Invalid("نزال غير معروف.", $"Bout {p.BoutId} does not belong to this division."), null, []);
            if (bout.IsBye && !bout.IsWalkover) return (Refuse("bye", "الإعفاء ليس نزالًا ولا يُجدول.", "A BYE is not a bout: it never takes a ring, date, time or number.", 400), null, []);
            if (!Fought(bout)) return (Refuse("results_locked", "سُجّلت نتيجة هذا النزال.", "A walkover has no slot to schedule."), null, []);
            if (!ctx.Days.Contains(p.Date.Date))
                return (Refuse("outside_dates", "التاريخ خارج أيام البطولة.", $"{p.Date:dd MMM yyyy} is not a day of this tournament.", 400), null, []);
            var ring = ctx.Rings.FirstOrDefault(r => r.Id == p.RingId);
            if (ring is null || !ring.IsActive) return (Refuse("inactive_ring", "الحلبة غير متاحة.", "Every bout needs an active ring of this tournament."), null, []);
            if (p.Position < 1) return (Outcome.Invalid("الترتيب غير صالح.", "A bout's place in the ring queue starts at 1."), null, []);
        }
        var missing = mine.Count(b => !planned.ContainsKey(b.Id));
        if (missing > 0)
            return (Outcome.Invalid("كل نزال يحتاج إلى حلبة وتاريخ ووقت.", $"Every bout needs a ring, a date and a time before the division can be saved ({missing} missing)."), null, []);
        if (defaultRingId is { } dr && !ctx.Rings.Any(r => r.Id == dr && r.IsActive))
            return (Refuse("inactive_ring", "الحلبة غير متاحة.", "The division's default ring must be an active ring of this tournament."), null, []);
        foreach (var tp in timing)
            if (!ctx.Days.Contains(tp.Date.Date) || ctx.Rings.All(r => r.Id != tp.RingId))
                return (Outcome.Invalid("توقيت غير صالح.", "Timing can only be set for a ring of this tournament on one of its days."), null, []);

        foreach (var b in mine.Where(Locked))
        {
            var p = planned[b.Id];
            if (b.RingId != p.RingId || b.ScheduledDate?.Date != p.Date.Date || b.OrderInRing != p.Position || b.ManualStartTime != p.Time)
                return (Refuse("results_locked", "سُجّلت نتيجة هذا النزال؛ لا يمكن نقله.", $"Bout {BoutRef(ctx, b.Id)} has an official result; its slot is protected."), null, []);
        }

        var crossing = mine.Where(b => Assigned(b) && (b.RingId != planned[b.Id].RingId || b.ScheduledDate!.Value.Date != planned[b.Id].Date.Date)).ToList();
        if (crossing.Count > 0 && !actor.Has(AdminPermissions.TournamentScheduleCrossRing))
            return (Refuse("cross_ring_forbidden", "نقل النزال إلى حلبة أو يوم آخر من صلاحية المندوب الفني.",
                $"{crossing.Count} already scheduled bout(s) would move to another ring or day. That needs the '{AdminPermissions.TournamentScheduleCrossRing}' permission (the Technical Delegate's authority).", 403), null, []);

        // A first save creates the Draft (an explicit action; viewing never does).
        var creates = t.ScheduleStatus is null;
        if (creates)
        {
            t.ScheduleStatus = Statuses.Draft;
            t.ScheduleRevision = Math.Max(1, t.ScheduleRevision + 1);
            t.ScheduleCreatedAt = DateTime.UtcNow;
            t.ScheduleCreatedBy = actor.Username;
            t.ScheduleSourceSnapshot = JsonSerializer.Serialize(SourceSignature(ctx));
        }

        var before = Snapshot(ctx);
        var safetyBefore = Safety(ctx);

        // Shared ring/day timing from the division settings.
        var timingChanges = new List<object>();
        var timingChanged = false;
        var days = new HashSet<DateTime>();
        var sharedTimingChange = false;
        foreach (var tp in timing.GroupBy(x => (x.RingId, x.Date.Date)).Select(g => g.Last()))
        {
            var current = ctx.Timing(tp.Date.Date, tp.RingId);
            var changesTimes = current.First != tp.FirstBoutTime || current.Interval != tp.IntervalMinutes;
            if (current.Configured && !changesTimes) continue;
            // An approved schedule is not touched by a setting that changes no time.
            if (!changesTimes && wasApproved) continue;
            if (changesTimes) timingChanged = true;
            var others = ctx.Bouts.Count(b => !planned.ContainsKey(b.Id) && b.RingId == tp.RingId && b.ScheduledDate?.Date == tp.Date.Date && b.OrderInRing is not null);
            if (changesTimes && others > 0) sharedTimingChange = true;
            var setting = ctx.Settings.FirstOrDefault(s => s.RingId == tp.RingId && s.Date.Date == tp.Date.Date);
            if (setting is null)
            {
                setting = new RingDaySetting { TournamentId = tournamentId, RingId = tp.RingId, Date = tp.Date.Date };
                db.RingDaySettings.Add(setting);
                ctx.Settings.Add(setting);
            }
            timingChanges.Add(new
            {
                ringId = tp.RingId, ring = ctx.Rings.First(r => r.Id == tp.RingId).Name, date = tp.Date.ToString("yyyy-MM-dd"),
                from = $"{current.First:hh\\:mm} every {current.Interval} min" + (current.Configured ? string.Empty : " (default)"),
                to = $"{tp.FirstBoutTime:hh\\:mm} every {tp.IntervalMinutes} min", otherBouts = others, changesTimes,
            });
            setting.FirstBoutTime = tp.FirstBoutTime;
            setting.IntervalMinutes = tp.IntervalMinutes;
            setting.UpdatedAt = DateTime.UtcNow;
            setting.UpdatedBy = actor.Username;
            days.Add(tp.Date.Date);
        }

        // Each destination queue: the bouts already there that are not in this plan keep their relative
        // order; this division's bouts go in at their requested places (lowest first).
        foreach (var b in mine.Where(b => b.ScheduledDate is not null)) days.Add(b.ScheduledDate!.Value.Date);
        foreach (var group in plan.GroupBy(p => (p.RingId, Date: p.Date.Date)))
        {
            var queue = ctx.Bouts
                .Where(b => !planned.ContainsKey(b.Id) && b.ScheduledDate?.Date == group.Key.Date && b.RingId == group.Key.RingId && b.OrderInRing is not null)
                .OrderBy(b => b.OrderInRing).ThenBy(b => b.Id).ToList();
            foreach (var p in group.OrderBy(p => p.Position).ThenBy(p => mine.FindIndex(b => b.Id == p.BoutId)))
            {
                var bout = mine.First(b => b.Id == p.BoutId);
                queue.Insert(Math.Clamp(p.Position - 1, 0, queue.Count), bout);
                bout.ScheduledDate = group.Key.Date;
                bout.RingId = group.Key.RingId;
                bout.ManualStartTime = p.Time;
            }
            for (var i = 0; i < queue.Count; i++) pendingOrder[queue[i].Id] = (i + 1) * 2;
            days.Add(group.Key.Date);
        }

        var locked = await RecalculateAsync(ctx, days, ct, before);
        pendingOrder.Clear();
        if (locked is not null) return (locked, null, []);
        // Times in a ring must follow the ring's order: an entered time is never moved or reordered silently.
        var disorder = TimeOrderIssues(ctx, days);
        if (disorder.Count > 0)
            return (Refuse("time_order", "وقت نزال لا يتبع ترتيب الحلبة.", disorder[0].MessageEn), null, disorder);
        var introduced = Introduced(safetyBefore, Safety(ctx));
        if (introduced.Count > 0)
        {
            var issues = introduced.Select(s => { var (ar, en) = DescribeIssue(ctx, s); return new Issue("athlete_" + s.Kind, "blocking", ar, en, s.BoutIds, s.Date, s.Potential, PersonName(ctx, s.PersonId)); }).ToList();
            return (SafetyRefusal(ctx, introduced), null, issues);
        }

        string Where((DateTime? Date, int? Ring, int? Number, TimeSpan? Start) s) =>
            s.Number is null ? "unscheduled"
                : $"{ctx.Rings.FirstOrDefault(r => r.Id == s.Ring)?.Name} · {s.Date:dd MMM} {s.Start:hh\\:mm}";
        var othersAffected = ctx.Bouts
            .Where(b => !planned.ContainsKey(b.Id) && before.TryGetValue(b.Id, out var was)
                        && (was.Date != b.ScheduledDate || was.Ring != b.RingId || was.Number != b.BoutNumber || was.Start != b.StartTime))
            .Select(b => (object)new
            {
                boutId = b.Id, division = $"{ctx.Divisions.First(d => d.Id == b.DivisionId).Describe(false)} · round {b.Round} · match {b.Position}",
                from = Where(before[b.Id]), to = Where((b.ScheduledDate, b.RingId, b.BoutNumber, b.StartTime)),
                timeChanged = before[b.Id].Start != b.StartTime,
            }).ToList();
        // An ACTUAL change: any bout's day, ring, number or time, or a ring/day timing that moves times.
        var changesSchedule = timingChanged || ctx.Bouts.Any(b => before.TryGetValue(b.Id, out var was)
            && (was.Date != b.ScheduledDate || was.Ring != b.RingId || was.Number != b.BoutNumber || was.Start != b.StartTime));
        var invalidates = wasApproved && changesSchedule;
        var result = new DivisionSaveResult(
            mine.Select(b => (object)new
            {
                boutId = b.Id, ringId = b.RingId, date = b.ScheduledDate?.ToString("yyyy-MM-dd"), number = b.BoutNumber,
                startTime = b.StartTime?.ToString(@"hh\:mm"), manualTime = b.ManualStartTime?.ToString(@"hh\:mm"), queuePosition = b.OrderInRing,
            }).ToList(),
            othersAffected, timingChanges, crossing.Count, creates,
            othersAffected.Count > 0 || sharedTimingChange || crossing.Count > 0 || invalidates, changesSchedule, invalidates);

        // A dry run stops here: the transaction is disposed without a commit, so nothing is kept.
        if (dryRun) return (Outcome.Success(), result, []);
        if (invalidates && string.IsNullOrWhiteSpace(ApprovalChangeReason))
            return (Refuse("approval_reason_required", "تغيير جدول معتمد يتطلب ذكر السبب ويلغي الاعتماد.",
                "This schedule is approved. Saving these changes cancels the approval and needs a written reason; the schedule must then be reviewed and approved again."), result, []);
        if (result.NeedsConfirmation && !confirm)
            return (Refuse(ConfirmRequiredCode, "هذا الحفظ يؤثر على نزالات أخرى أو توقيت حلبة مشترك؛ راجع وأكّد.",
                "This save also changes other bouts, a shared ring timing or moves scheduled bouts. Review the consequences and confirm."), result, []);
        if (crossing.Count > 0 && string.IsNullOrWhiteSpace(why))
            return (Outcome.Invalid("يجب ذكر سبب نقل النزالات.", "A reason is required to move scheduled bouts to another ring or day."), result, []);

        foreach (var b in crossing) b.RingPinned = true;
        if (defaultRingId is { } ringDefault && changesSchedule) division.DefaultRingId = ringDefault;
        if (changesSchedule || creates) Touch(t, actor); // cancels an approval when there is one
        else
        {
            // A no-op save confirms the values as shown: the division becomes Scheduled, the approval stays.
            t.ScheduleRevision++;
            t.ScheduleUpdatedAt = DateTime.UtcNow;
            t.ScheduleUpdatedBy = actor.Username;
        }
        var acceptedBefore = t.ScheduleSourceSnapshot;
        t.ScheduleSourceSnapshot = AcceptSource(ctx, divisionId);
        var sourceAccepted = !creates && acceptedBefore != t.ScheduleSourceSnapshot;
        division.ScheduleSavedSource = "division_page";
        division.ScheduleSavedAt = DateTime.UtcNow;
        division.ScheduleSavedBy = actor.Username;
        division.ScheduleSavedRevision = t.ScheduleRevision;
        if (creates)
            audit.Write(actor, AuditActions.ScheduleCreated, "tournament", t.Id, t.NameEn, toStatus: Statuses.Draft,
                details: $"Draft created by the first Save Division Schedule ({division.Describe(false)}).");
        audit.Write(actor, AuditActions.ScheduleDivisionSaved, "tournament_division", divisionId, division.Describe(false),
            toStatus: "saved",
            details: $"Division schedule saved: {mine.Count} bout(s) — {string.Join(", ", mine.Select(b => BoutRef(ctx, b.Id)))}."
                     + (timingChanges.Count > 0 ? $" Ring timing set for {timingChanges.Count} ring/day(s)." : string.Empty)
                     + (othersAffected.Count > 0 ? $" {othersAffected.Count} bout(s) of other divisions renumbered or retimed (confirmed)." : string.Empty)
                     + (crossing.Count > 0 ? $" {crossing.Count} bout(s) moved to another ring or day." : string.Empty)
                     + (string.IsNullOrWhiteSpace(why) ? string.Empty : $" Reason: {why}")
                     + (invalidates ? $" The schedule was approved: the approval was cancelled (reason: {ApprovalChangeReason!.Trim()})."
                        : changesSchedule ? string.Empty : " No ring, day or time changed: the values shown were confirmed as the division's schedule.")
                     + (sourceAccepted ? " The division's current published bracket was reviewed and accepted as the schedule's source." : string.Empty));
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return (Outcome.Success(), result, []);
    }

    /* ── changes since the schedule was published ─────────────────────── */

    /// <param name="DrawRepublished">A new version of this division's draw was published after the schedule was.</param>
    public sealed record ScheduleChangeDivision(int DivisionId, string Title, string Weight, IReadOnlyList<string> Changes,
        bool DrawRepublished = false);

    public sealed record ScheduleChanges(
        int? Version, DateTime? PublishedAt, bool Withdrawn, bool UpdateRequired, IReadOnlyList<ScheduleChangeDivision> Divisions);

    /// <summary>
    /// Read-only. Compares the latest schedule publication (its stored public snapshot) with the draws and bouts as
    /// they are now, one division at a time. A division needs a schedule update only when what the published
    /// schedule shows for it no longer holds: its scheduled bouts differ from the published ones (draw regenerated,
    /// bouts unscheduled, pairings or times changed) or its eligible athletes no longer match its draw (so the draw,
    /// and with it the bouts, must change). Bout numbers and "Winner of Bout n" placeholders are left out of the
    /// comparison, so renumbering caused by another division never marks this one. Nothing is changed here.
    /// </summary>
    public async Task<ScheduleChanges> ChangesSincePublicationAsync(int tournamentId, DrawService draws, CancellationToken ct = default)
    {
        var publication = await db.SchedulePublications.AsNoTracking()
            .Where(p => p.TournamentId == tournamentId)
            .OrderByDescending(p => p.Version).FirstOrDefaultAsync(ct);
        if (publication is null) return new(null, null, false, false, []);
        var since = publication.PublishedAt;

        // What the published schedule shows, per division label.
        static string Side(JsonNode? corner) =>
            corner?["nameEn"]?.GetValue<string>() is { Length: > 0 } name ? name : "-";
        var published = new Dictionary<string, List<string>>();
        var root = JsonNode.Parse(publication.SnapshotJson);
        foreach (var day in root?["days"]?.AsArray() ?? [])
        foreach (var ring in day?["rings"]?.AsArray() ?? [])
        foreach (var b in ring?["bouts"]?.AsArray() ?? [])
        {
            var label = b?["divisionEn"]?.GetValue<string>() ?? "";
            if (!published.TryGetValue(label, out var list)) published[label] = list = [];
            list.Add(string.Join("|", day?["date"]?.GetValue<string>(), ring?["name"]?.GetValue<string>(),
                b?["startTime"]?.GetValue<string>(), b?["roundEn"]?.GetValue<string>(),
                b?["walkover"]?.GetValue<bool>() == true, Side(b?["red"]), Side(b?["blue"])));
        }

        // The same projection of the schedule as it is now (only published brackets feed the schedule).
        var ctx = await LoadAsync(tournamentId, ct);
        var roundsOf = ctx.Bouts.GroupBy(b => b.DivisionId).ToDictionary(g => g.Key,
            g => (Total: g.Max(b => b.Round), Partial: g.Any(b => b.Round == 1 && b.IsBye && !b.IsWalkover)));
        string Named(int? entryId) =>
            entryId is { } id && ctx.Entries.TryGetValue(id, out var e) ? DrawService.DisplayName(e, false) ?? "-" : "-";
        var current = new Dictionary<int, List<string>>();
        foreach (var b in OfficialOrder(ctx))
        {
            var r = roundsOf[b.DivisionId];
            if (!current.TryGetValue(b.DivisionId, out var list)) current[b.DivisionId] = list = [];
            list.Add(string.Join("|", b.ScheduledDate!.Value.ToString("yyyy-MM-dd"),
                ctx.Rings.FirstOrDefault(x => x.Id == b.RingId)?.Name, b.StartTime?.ToString(@"hh\:mm"),
                BoutRounds.Name(b.Round, r.Total, b.Round == 1 && r.Partial).En, b.IsWalkover,
                Named(b.RedEntryId), Named(b.BlueEntryId)));
        }

        // Bouts whose number, position or time no longer follow from their ring-day queue (e.g. a slot before them was
        // freed when another division's draw was regenerated): their division genuinely has to be rescheduled.
        var recalcBouts = Validate(ctx).Where(i => i.Code == "numbering").SelectMany(i => i.BoutIds).ToHashSet();
        var recalc = ctx.Bouts.Where(b => recalcBouts.Contains(b.Id)).Select(b => b.DivisionId).ToHashSet();

        // Every division of the tournament (a regenerated draw is a Draft and is not in ctx).
        var divisions = await db.TournamentDivisions.AsNoTracking()
            .Where(d => d.TournamentId == tournamentId).ToListAsync(ct);
        var allBouts = await db.Bouts.AsNoTracking().Where(b => b.TournamentId == tournamentId).ToListAsync(ct);
        var ids = allBouts.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).OfType<int>().Distinct().ToList();
        var names = (await db.TournamentEntries.AsNoTracking().Include(e => e.AthleteRegistration)
                .Where(e => ids.Contains(e.Id)).ToListAsync(ct))
            .ToDictionary(e => e.Id, e => DrawService.DisplayName(e, false) ?? "An athlete");
        var versions = await db.DrawPublications.AsNoTracking()
            .Where(p => p.TournamentId == tournamentId).ToListAsync(ct);
        var regenerated = (await db.AuditLog.AsNoTracking()
                .Where(a => a.EntityType == "tournament_division" && a.Action == AuditActions.DrawRegenerated && a.CreatedAt > since)
                .Select(a => a.EntityId).ToListAsync(ct))
            .ToHashSet();

        var result = new List<ScheduleChangeDivision>();
        foreach (var d in divisions.OrderBy(d => d.Gender).ThenBy(d => d.Category).ThenBy(d => d.SortWeight))
        {
            var label = d.Describe(false);
            var inPublication = published.TryGetValue(label, out var before);
            current.TryGetValue(d.Id, out var now);
            if (!inPublication && now is null) continue; // not part of the published schedule, and not scheduled now

            var w = d.WeightLabel(false);
            var boutsDiffer = !(before ?? []).OrderBy(x => x).SequenceEqual((now ?? []).OrderBy(x => x));
            var bouts = allBouts.Where(b => b.DivisionId == d.Id).ToList();
            var sync = bouts.Count > 0 ? await draws.SyncAsync(d, ct) : null;
            var eligibilityChanged = sync?.Changed == true;
            var needsRecalc = recalc.Contains(d.Id);
            if (!boutsDiffer && !eligibilityChanged && !needsRecalc) continue; // what the schedule shows for it still holds

            var changes = new List<string>();
            if (!inPublication) changes.Add($"The {w} division was added to the schedule.");

            // The draw's athletes against the draw version that was public when the schedule was published.
            var atPublication = versions.FirstOrDefault(v => v.DivisionId == d.Id && v.PublishedAt <= since
                                                             && (v.SupersededAt == null || v.SupersededAt > since));
            if (inPublication && atPublication is not null)
            {
                var then = DrawNames(atPublication.SnapshotJson);
                var drawNow = bouts.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).OfType<int>().Distinct()
                    .Select(id => names.TryGetValue(id, out var n) ? n : "An athlete").ToHashSet();
                foreach (var n in drawNow.Except(then).Order()) changes.Add($"{n} was added to the {w} draw.");
                foreach (var n in then.Except(drawNow).Order()) changes.Add($"{n} was removed from the {w} draw.");
            }
            if (regenerated.Contains(d.Id)) changes.Add($"The {w} draw was regenerated.");
            if (bouts.Count > 0 && d.DrawPublishedAt is null) changes.Add($"The updated {w} draw has not been published yet.");
            else if (versions.Any(v => v.DivisionId == d.Id && v.PublishedAt > since)) changes.Add($"A new version of the {w} draw was published.");

            if (eligibilityChanged)
            {
                foreach (var a in sync!.Removed)
                    changes.Add(a.Reason == "no longer in this weight class"
                        ? $"{a.NameEn ?? "An athlete"} moved to another weight class."
                        : $"{a.NameEn ?? "An athlete"} is no longer eligible for the {w} draw.");
                foreach (var a in sync.Added) changes.Add($"{a.NameEn ?? "An athlete"} is now eligible for the {w} draw.");
                changes.Add($"The {w} draw needs to be regenerated.");
            }

            var unscheduled = d.DrawPublishedAt is null || bouts.Any(b => Fought(b) && !Assigned(b));
            if (needsRecalc)
            {
                changes.Add($"An earlier slot on the {w} division's day changed, so its bout numbers and times must be recalculated.");
                changes.Add($"The {w} division's bouts need to be rescheduled.");
            }
            else changes.Add(boutsDiffer && !unscheduled && !eligibilityChanged
                ? $"The {w} division's bouts were rescheduled; the updated schedule needs to be published."
                : $"The {w} division's bouts need to be rescheduled.");
            result.Add(new(d.Id, label, w, changes, versions.Any(v => v.DivisionId == d.Id && v.PublishedAt > since)));
        }

        return new(publication.Version, publication.PublishedAt, publication.WithdrawnAt is not null, result.Count > 0, result);
    }

    /// <summary>The athletes' English names in a published draw's public snapshot.</summary>
    private static HashSet<string> DrawNames(string snapshotJson)
    {
        var set = new HashSet<string>();
        foreach (var round in JsonNode.Parse(snapshotJson)?["rounds"]?.AsArray() ?? [])
        foreach (var bout in round?["bouts"]?.AsArray() ?? [])
        foreach (var side in new[] { "red", "blue" })
            if (bout?[side]?["nameEn"]?.GetValue<string>() is { Length: > 0 } n) set.Add(n);
        return set;
    }

    /* tournament-wide publication (Stage 5 Step 3) */

    public const string PublishBlockedCode = "publish_blocked";

    public sealed record PublishResult(int Version, int BoutCount, int DivisionCount, DateTime PublishedAt, string PublishedBy, bool AlreadyPublished);

    /// <summary>The publication currently visible on the public website, if any.</summary>
    public Task<SchedulePublication?> CurrentPublicationAsync(int tournamentId, CancellationToken ct = default) =>
        db.SchedulePublications.AsNoTracking()
            .Where(p => p.TournamentId == tournamentId && p.WithdrawnAt == null)
            .OrderByDescending(p => p.Version).FirstOrDefaultAsync(ct);

    /// <summary>
    /// The official order: tournament day, then the configured ring order, then
    /// the bout's place in that ring's day queue; the bout id breaks any tie.
    /// Every bout holding a slot is numbered (BYEs never hold one).
    /// </summary>
    private static List<Bout> OfficialOrder(Ctx ctx)
    {
        var ringOrder = ctx.Rings.ToDictionary(r => r.Id, r => (r.SortOrder, r.Id));
        return ctx.Bouts
            .Where(b => !(b.IsBye && !b.IsWalkover) && Assigned(b))
            .OrderBy(b => b.ScheduledDate!.Value.Date)
            .ThenBy(b => ringOrder.TryGetValue(b.RingId!.Value, out var o) ? o.SortOrder : int.MaxValue)
            .ThenBy(b => ringOrder.TryGetValue(b.RingId!.Value, out var o) ? o.Id : int.MaxValue)
            .ThenBy(b => b.OrderInRing)
            .ThenBy(b => b.Id)
            .ToList();
    }

    /// <summary>Everything that blocks publication, as actionable issues (empty = publishable).</summary>
    private List<Issue> PublicationBlockers(Ctx ctx)
    {
        var issues = new List<Issue>();
        var t = ctx.Tournament;
        if (t.ScheduleStatus != Statuses.Approved || t.ScheduleApprovedAt is null)
            issues.Add(new Issue("not_approved", "blocking", "يجب اعتماد الجدول قبل نشره.",
                t.ScheduleStatus is null
                    ? "There is no schedule yet. Schedule every division, submit the schedule for review and have it approved before publishing."
                    : $"The schedule is {(t.ScheduleStatus == Statuses.Review ? "in review" : "a draft")}. It must be approved before it can be published.",
                [], null, false));
        foreach (var d in ctx.Divisions)
        {
            var fought = ctx.Bouts.Where(b => b.DivisionId == d.Id && Fought(b)).ToList();
            if (fought.Count == 0) continue;
            var label = d.Describe(false);
            if (d.ScheduleSavedAt is null || d.ScheduleSavedSource != "division_page" || fought.Any(b => !Assigned(b) || b.BoutNumber is null || b.StartTime is null))
                issues.Add(new Issue("division_not_scheduled", "blocking", $"الفئة {d.Describe(true)} غير مجدولة.",
                    $"{label} is Not Scheduled: open it, review every bout's ring, day and time, and save the division schedule.",
                    fought.Select(b => b.Id).ToList(), null, false, label));
        }
        issues.AddRange(Validate(ctx).Where(i => i.Severity == "blocking" && i.Code != "unscheduled"));
        return issues;
    }

    /// <summary>The public, read-only schedule exactly as it will be shown on the website.</summary>
    private string PublicSnapshot(Ctx ctx, IReadOnlyList<Bout> ordered, int version, DateTime publishedAt)
    {
        var roundsOf = ctx.Bouts.GroupBy(b => b.DivisionId).ToDictionary(g => g.Key,
            g => (Total: g.Max(b => b.Round), Partial: g.Any(b => b.Round == 1 && b.IsBye && !b.IsWalkover)));
        var feeders = ctx.Bouts.Where(b => b.WinnerToBoutId is not null)
            .GroupBy(b => (b.WinnerToBoutId!.Value, (b.WinnerToCorner ?? "red").ToLowerInvariant()))
            .ToDictionary(g => g.Key, g => g.First());
        var divisions = ctx.Divisions.ToDictionary(d => d.Id);
        var days = ctx.Days.Select((d, i) => (Date: d.Date, Index: i + 1)).ToDictionary(x => x.Date, x => x.Index);

        object Corner(Bout b, string corner)
        {
            var entryId = corner == "red" ? b.RedEntryId : b.BlueEntryId;
            if (entryId is { } id && ctx.Entries.TryGetValue(id, out var e))
                return new { nameAr = DrawService.DisplayName(e, true), nameEn = DrawService.DisplayName(e, false), club = DrawClub.Of(e) };
            if (feeders.TryGetValue((b.Id, corner), out var f) && !(f.IsBye && !f.IsWalkover) && f.OfficialBoutNumber is { } n)
                return new { placeholderAr = $"الفائز من النزال {n}", placeholderEn = $"Winner of Bout {n}" };
            return new { placeholderAr = "يُحدَّد لاحقًا", placeholderEn = "To be decided" };
        }

        var snapshot = new
        {
            version, publishedAt,
            tournament = new { ctx.Tournament.Id, ctx.Tournament.NameAr, ctx.Tournament.NameEn },
            days = ordered.GroupBy(b => b.ScheduledDate!.Value.Date).OrderBy(g => g.Key).Select(day => new
            {
                day = days.TryGetValue(day.Key, out var i) ? i : 0,
                date = day.Key.ToString("yyyy-MM-dd"),
                rings = day.GroupBy(b => b.RingId!.Value)
                    .OrderBy(g => ctx.Rings.FirstOrDefault(r => r.Id == g.Key)?.SortOrder ?? int.MaxValue).Select(ring => new
                    {
                        name = ctx.Rings.FirstOrDefault(r => r.Id == ring.Key)?.Name,
                        bouts = ring.Select(b =>
                        {
                            var d = divisions[b.DivisionId];
                            var r = roundsOf[b.DivisionId];
                            var round = BoutRounds.Name(b.Round, r.Total, b.Round == 1 && r.Partial);
                            return new
                            {
                                number = b.OfficialBoutNumber, startTime = b.StartTime?.ToString(@"hh\:mm"),
                                divisionAr = d.Describe(true), divisionEn = d.Describe(false), gender = d.Gender,
                                roundAr = round.Ar, roundEn = round.En, walkover = b.IsWalkover,
                                red = Corner(b, "red"), blue = Corner(b, "blue"),
                            };
                        }),
                    }),
            }),
        };
        return JsonSerializer.Serialize(snapshot, new JsonSerializerOptions(JsonSerializerDefaults.Web));
    }

    /// <summary>
    /// Publish Schedule — one atomic, tournament-wide operation under the write
    /// lock: re-validate the whole approved schedule, number every bout
    /// (day → ring order → place), store the numbers and the public snapshot and
    /// record the version. Any failure rolls everything back. Publishing the same
    /// revision again is a no-op (idempotent); a concurrent attempt waits for the
    /// lock and then sees the publication.
    /// </summary>
    public async Task<(Outcome Result, PublishResult? Published, IReadOnlyList<Issue> Issues)> PublishAsync(
        int tournamentId, int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        if (!actor.Has(AdminPermissions.TournamentSchedulePublish))
            return (Refuse("forbidden", "النشر يحتاج إلى صلاحية نشر الجدول.",
                $"Publishing needs the '{AdminPermissions.TournamentSchedulePublish}' permission.", 403), null, []);
        await using var transaction = db.Database.CurrentTransaction is null
            ? await EmailReservations.BeginExclusiveAsync(db, ct) : null;
        if (!await db.Tournaments.AnyAsync(x => x.Id == tournamentId, ct)) return (Outcome.NotFound(), null, []);
        var ctx = await LoadAsync(tournamentId, ct);
        var t = ctx.Tournament;

        var current = await db.SchedulePublications
            .Where(p => p.TournamentId == tournamentId && p.WithdrawnAt == null)
            .OrderByDescending(p => p.Version).FirstOrDefaultAsync(ct);
        if (current is not null && current.ScheduleRevision == t.ScheduleRevision)
            return (Outcome.Success(), new PublishResult(current.Version, current.BoutCount, current.DivisionCount,
                current.PublishedAt, current.PublishedBy, true), []);
        if (expectedRevision != t.ScheduleRevision)
            return (Refuse(StaleCode, "تغيّر الجدول منذ فتح الصفحة.",
                $"The schedule changed since this page was loaded (revision {expectedRevision}, now {t.ScheduleRevision}). Reload and review before publishing."), null, []);

        var blockers = PublicationBlockers(ctx);
        if (blockers.Count > 0)
            return (Refuse(PublishBlockedCode, "لا يمكن نشر الجدول قبل حل المشكلات.",
                $"The schedule cannot be published: {blockers.Count} issue(s) must be resolved first."), null, blockers);

        var ordered = OfficialOrder(ctx);
        // Clear first, then number, so the unique index never sees a transient duplicate. Bouts outside the published
        // brackets (none should carry a number) are cleared too, so a number left from the replaced version never collides.
        var inCtx = ctx.Bouts.Select(b => b.Id).ToList();
        await db.Bouts.Where(b => b.TournamentId == tournamentId && b.OfficialBoutNumber != null && !inCtx.Contains(b.Id))
            .ExecuteUpdateAsync(x => x.SetProperty(b => b.OfficialBoutNumber, (int?)null), ct);
        foreach (var b in ctx.Bouts) b.OfficialBoutNumber = null;
        await db.SaveChangesAsync(ct);
        for (var i = 0; i < ordered.Count; i++) ordered[i].OfficialBoutNumber = i + 1;

        var version = (await db.SchedulePublications.Where(p => p.TournamentId == tournamentId)
            .Select(p => (int?)p.Version).MaxAsync(ct) ?? 0) + 1;
        var now = DateTime.UtcNow;
        var divisionCount = ordered.Select(b => b.DivisionId).Distinct().Count();
        var publication = new SchedulePublication
        {
            TournamentId = tournamentId, Version = version, ScheduleRevision = t.ScheduleRevision,
            PublishedAt = now, PublishedBy = actor.Username, BoutCount = ordered.Count, DivisionCount = divisionCount,
            SnapshotJson = PublicSnapshot(ctx, ordered, version, now),
        };
        db.SchedulePublications.Add(publication);
        // The version it replaces leaves the website in the same transaction and stays in the history, its snapshot untouched.
        if (current is not null)
        {
            current.WithdrawnAt = now;
            current.WithdrawnBy = actor.Username;
            current.WithdrawReason = $"Replaced by version {version}.";
        }
        audit.Write(actor, AuditActions.SchedulePublished, "tournament", t.Id, t.NameEn, fromStatus: "schedule_approved", toStatus: "schedule_published",
            details: $"Version {version} published (revision {t.ScheduleRevision})"
                     + (current is null ? "" : $", replacing version {current.Version} (kept in the publication history)")
                     + $": bouts #1–#{ordered.Count} across {divisionCount} division(s), "
                     + $"{ordered.Select(b => b.ScheduledDate!.Value.Date).Distinct().Count()} day(s) and {ordered.Select(b => b.RingId).Distinct().Count()} ring(s). "
                     + "Numbered by day, then ring order, then place in the ring.");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return (Outcome.Success(), new PublishResult(version, ordered.Count, divisionCount, now, actor.Username, false), []);
    }

    /// <summary>
    /// Unpublish — an authorised withdrawal from the public website, with a
    /// reason. The version stays on record (stamped withdrawn); the official
    /// numbers are cleared from the bouts (they remain in that version's
    /// snapshot); the schedule stays approved until an approver withdraws the
    /// approval to change it. Never renumbers anything.
    /// </summary>
    public async Task<Outcome> UnpublishAsync(int tournamentId, string? reason, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        if (!actor.Has(AdminPermissions.TournamentSchedulePublish))
            return Refuse("forbidden", "صلاحية النشر مطلوبة.", $"Unpublishing needs the '{AdminPermissions.TournamentSchedulePublish}' permission.", 403);
        var why = reason?.Trim();
        if (string.IsNullOrWhiteSpace(why)) return Outcome.Invalid("يجب ذكر سبب إلغاء النشر.", "A reason for unpublishing the schedule is required.");
        if (why.Length > 500) return Outcome.Invalid("السبب طويل.", "Keep the reason to 500 characters.");
        await using var transaction = db.Database.CurrentTransaction is null
            ? await EmailReservations.BeginExclusiveAsync(db, ct) : null;
        var t = await db.Tournaments.FirstOrDefaultAsync(x => x.Id == tournamentId, ct);
        if (t is null) return Outcome.NotFound();
        var current = await db.SchedulePublications
            .Where(p => p.TournamentId == tournamentId && p.WithdrawnAt == null)
            .OrderByDescending(p => p.Version).FirstOrDefaultAsync(ct);
        if (current is null) return Refuse("not_published", "الجدول غير منشور.", "The schedule is not published.");
        current.WithdrawnAt = DateTime.UtcNow;
        current.WithdrawnBy = actor.Username;
        current.WithdrawReason = why;
        await db.Bouts.Where(b => b.TournamentId == tournamentId && b.OfficialBoutNumber != null)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.OfficialBoutNumber, (int?)null), ct);
        audit.Write(actor, AuditActions.ScheduleUnpublished, "tournament", t.Id, t.NameEn, fromStatus: "schedule_published", toStatus: "schedule_approved",
            details: $"Version {current.Version} (published {current.PublishedAt:yyyy-MM-dd HH:mm} UTC by {current.PublishedBy}) withdrawn from the public website. "
                     + $"Its numbers stay on record in that version. The schedule is still approved. Reason: {why}");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    /// <summary>The public schedule (current publication only), or null when nothing is published.</summary>
    /// <summary>
    /// The current publication for the website: the stored snapshot exactly as published (never rewritten),
    /// with two display fields added to each NAMED athlete corner when it is read —
    /// <c>nationality</c> (ISO alpha-2, the registration field the Admin uses) and <c>photo</c> (an opaque
    /// key, only when <see cref="PublicPhotos"/> authorizes it now). A corner is matched to its athlete by
    /// the published bout number and corner, and only when that athlete's names still equal the published
    /// ones; placeholders ("Winner of Bout n"), substitutions and any mismatch get nothing.
    /// </summary>
    public async Task<string?> PublicScheduleJsonAsync(int tournamentId, CancellationToken ct = default)
    {
        var json = (await CurrentPublicationAsync(tournamentId, ct))?.SnapshotJson;
        if (json is null) return null;
        var root = System.Text.Json.Nodes.JsonNode.Parse(json);
        if (root is null) return json;
        var corners = PublishedCorners(root).ToList();
        if (corners.Count == 0) return json;

        var athletes = await PublishedAthletesAsync(tournamentId, corners.Select(c => c.Number).Distinct().ToList(), ct);
        await ResolveByNameAsync(tournamentId, corners, athletes, ct);
        var registrationIds = athletes.Values.Select(e => e.AthleteRegistrationId).Distinct().ToList();
        var accounts = await db.MemberAccounts.AsNoTracking()
            .Where(m => registrationIds.Contains(m.RegistrationId) && m.Kind == MemberAccountKinds.Athlete)
            .ToListAsync(ct);
        var now = DateTime.UtcNow;
        foreach (var (number, corner, node) in corners)
        {
            if (!athletes.TryGetValue((number, corner), out var e) || !SameAthlete(e, node)) continue;
            if (NationalityOf(e) is { } nationality) node["nationality"] = nationality;
            if (PublicPhotos.Authorized(e.AthleteRegistration, accounts, attachments, now, out var photoId))
                node["photo"] = PublicPhotos.Key(photoId!);
        }
        return root.ToJsonString();
    }

    /// <summary>
    /// The public photo of the athlete in a published bout's corner — addressed by the official bout number
    /// and corner, never by an id. Null (→ 404) unless the schedule is published, the published corner names
    /// an athlete, the bout's athlete is still that person, and <see cref="PublicPhotos"/> authorizes the photo now.
    /// </summary>
    public async Task<(string Path, string ContentType)?> PublicPhotoAsync(int tournamentId, int number, string corner, CancellationToken ct = default)
    {
        if (corner is not ("red" or "blue")) return null;
        var json = (await CurrentPublicationAsync(tournamentId, ct))?.SnapshotJson;
        var root = json is null ? null : System.Text.Json.Nodes.JsonNode.Parse(json);
        var published = root is null ? null : PublishedCorners(root).FirstOrDefault(c => c.Number == number && c.Corner == corner).Node;
        if (published is null) return null;
        var athletes = await PublishedAthletesAsync(tournamentId, [number], ct);
        await ResolveByNameAsync(tournamentId, [(number, corner, published)], athletes, ct);
        if (!athletes.TryGetValue((number, corner), out var e) || !SameAthlete(e, published)) return null;
        return await PublicDraw.EntryPhotoAsync(db, attachments, e.Id, ct);
    }

    /// <summary>Every NAMED athlete corner of a published snapshot (placeholders are skipped).</summary>
    private static IEnumerable<(int Number, string Corner, System.Text.Json.Nodes.JsonObject Node)> PublishedCorners(System.Text.Json.Nodes.JsonNode root)
    {
        foreach (var day in root["days"]?.AsArray() ?? [])
        foreach (var ring in day?["rings"]?.AsArray() ?? [])
        foreach (var bout in ring?["bouts"]?.AsArray() ?? [])
        {
            if (bout?["number"]?.GetValueKind() != JsonValueKind.Number) continue;
            var number = bout["number"]!.GetValue<int>();
            foreach (var corner in new[] { "red", "blue" })
                if (bout[corner] is System.Text.Json.Nodes.JsonObject c && (c["nameAr"] is not null || c["nameEn"] is not null))
                    yield return (number, corner, c);
        }
    }

    /// <summary>The athletes now in the given official bouts' corners (official numbers are unique per tournament).</summary>
    private async Task<Dictionary<(int Number, string Corner), TournamentEntry>> PublishedAthletesAsync(int tournamentId,
        IReadOnlyCollection<int> numbers, CancellationToken ct)
    {
        var bouts = await db.Bouts.AsNoTracking()
            .Where(b => b.OfficialBoutNumber != null && numbers.Contains(b.OfficialBoutNumber.Value)
                        && db.TournamentDivisions.Any(d => d.Id == b.DivisionId && d.TournamentId == tournamentId))
            .Select(b => new { Number = b.OfficialBoutNumber!.Value, b.RedEntryId, b.BlueEntryId })
            .ToListAsync(ct);
        var entryIds = bouts.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).OfType<int>().Distinct().ToList();
        var entries = await db.TournamentEntries.AsNoTracking().Include(e => e.AthleteRegistration)
            .Where(e => entryIds.Contains(e.Id)).ToDictionaryAsync(e => e.Id, ct);
        var result = new Dictionary<(int, string), TournamentEntry>();
        foreach (var b in bouts.GroupBy(b => b.Number).Where(g => g.Count() == 1).Select(g => g.First()))
        {
            if (b.RedEntryId is { } r && entries.TryGetValue(r, out var red)) result[(b.Number, "red")] = red;
            if (b.BlueEntryId is { } u && entries.TryGetValue(u, out var blue)) result[(b.Number, "blue")] = blue;
        }
        return result;
    }

    /// <summary>
    /// While an updated schedule is being prepared, the published version stays on the website but its bouts may
    /// no longer exist under the same official number (a regenerated draw replaces them). A corner that the live
    /// numbers no longer resolve to the published athlete is matched to the ONE entry of the tournament whose
    /// Arabic and English names are exactly the published ones; none or several → nothing is added. The stored
    /// snapshot itself is never changed.
    /// </summary>
    private async Task ResolveByNameAsync(int tournamentId,
        IReadOnlyCollection<(int Number, string Corner, System.Text.Json.Nodes.JsonObject Node)> corners,
        Dictionary<(int Number, string Corner), TournamentEntry> athletes, CancellationToken ct)
    {
        var open = corners.Where(c => !athletes.TryGetValue((c.Number, c.Corner), out var e) || !SameAthlete(e, c.Node)).ToList();
        if (open.Count == 0) return;
        var entries = await db.TournamentEntries.AsNoTracking().Include(e => e.AthleteRegistration)
            .Where(e => e.TournamentId == tournamentId).ToListAsync(ct);
        foreach (var (number, corner, node) in open)
        {
            var same = entries.Where(e => SameAthlete(e, node)).ToList();
            if (same.Count == 1) athletes[(number, corner)] = same[0];
            else athletes.Remove((number, corner));
        }
    }

    /// <summary>The entry is the athlete the snapshot published in that corner (both names, exactly as published).</summary>
    private static bool SameAthlete(TournamentEntry e, System.Text.Json.Nodes.JsonObject published) =>
        e.AthleteRegistration is not null
        && string.Equals((string?)published["nameAr"], DrawService.DisplayName(e, true), StringComparison.Ordinal)
        && string.Equals((string?)published["nameEn"], DrawService.DisplayName(e, false), StringComparison.Ordinal);

    /* lifecycle */

    public async Task<(Outcome Result, IReadOnlyList<Issue> Issues)> SubmitForReviewAsync(int tournamentId, int expectedRevision,
        AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return (refused, []);
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is null) return (NeedsDraft(), []);
        if (ctx.Tournament.ScheduleStatus == Statuses.Review) return (Outcome.Success(), []);
        var blocking = Validate(ctx).Where(i => i.Severity == "blocking").ToList();
        if (blocking.Count > 0)
            return (Refuse("blocking_issues", "لا يمكن إرسال الجدول للمراجعة: توجد مشكلات يجب حلها.",
                $"The schedule cannot go to review: {blocking.Count} blocking issue(s) must be resolved first."), blocking);
        var t = ctx.Tournament;
        t.ScheduleStatus = Statuses.Review;
        t.ScheduleSubmittedAt = DateTime.UtcNow;
        t.ScheduleSubmittedBy = actor.Username;
        audit.Write(actor, AuditActions.ScheduleSubmitted, "tournament", t.Id, t.NameEn, fromStatus: Statuses.Draft, toStatus: Statuses.Review,
            details: $"Submitted for approval at revision {t.ScheduleRevision}: {ctx.Bouts.Count(b => Fought(b) && Assigned(b))} bout(s), no blocking issues.");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return (Outcome.Success(), []);
    }

    /// <summary>
    /// Signs the schedule off (approver only — the endpoint enforces the
    /// permission). Re-runs every review check under the lock; refuses any
    /// blocking issue. Records approver, time and revision, and keeps a
    /// snapshot of the approved running order.
    /// </summary>
    public async Task<(Outcome Result, IReadOnlyList<Issue> Issues)> ApproveAsync(int tournamentId, int? expectedRevision,
        AdminIdentity.Actor actor, CancellationToken ct = default, bool requireReview = false)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null)
            return (refused.Code == ApprovedCode ? Refuse("already_approved", "الجدول معتمد بالفعل.", "The schedule is already approved.") : refused, []);
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        var t = ctx.Tournament;
        if (!ctx.Bouts.Any(b => Fought(b) && Assigned(b)))
            return (Outcome.Invalid("لا يوجد جدول لاعتماده.", "There is no schedule to approve yet."), []);
        // Stage 5 lifecycle: Draft → Review → Approved. The Stage 5 endpoint approves only a schedule in Review.
        if (requireReview && t.ScheduleStatus != Statuses.Review)
            return (Refuse("not_in_review", "يجب إرسال الجدول للمراجعة قبل اعتماده.",
                "The schedule must be submitted for review before it can be approved."), []);
        t.ScheduleStatus ??= Statuses.Draft;
        var blocking = Validate(ctx).Where(i => i.Severity == "blocking").ToList();
        if (blocking.Count > 0)
            return (Refuse("blocking_issues", "لا يمكن اعتماد جدول به مشكلات مانعة.",
                $"A schedule with {blocking.Count} blocking issue(s) cannot be approved."), blocking);

        var from = t.ScheduleStatus;
        t.ScheduleStatus = Statuses.Approved;
        t.ScheduleApprovedAt = DateTime.UtcNow;
        t.ScheduleApprovedBy = actor.Username;
        t.ScheduleApprovedRevision = t.ScheduleRevision;
        t.ScheduleApprovedSnapshot = JsonSerializer.Serialize(ctx.Bouts.Where(Assigned)
            .OrderBy(b => b.ScheduledDate).ThenBy(b => b.BoutNumber)
            .Select(b => new { b.Id, b.DivisionId, b.Round, date = b.ScheduledDate!.Value.ToString("yyyy-MM-dd"), ring = b.RingId, number = b.BoutNumber, start = b.StartTime?.ToString(@"hh\:mm") }));
        audit.Write(actor, AuditActions.ScheduleApproved, "tournament", t.Id, t.NameEn, fromStatus: from, toStatus: "schedule_approved",
            details: $"Approved revision {t.ScheduleRevision}: {ctx.Bouts.Count(b => Fought(b) && Assigned(b))} bout(s) across {ctx.Bouts.Where(Assigned).Select(b => b.ScheduledDate).Distinct().Count()} day(s).");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return (Outcome.Success(), []);
    }

    /// <summary>The legacy approve endpoint: the same checks, no revision.</summary>
    public async Task<Outcome> ApproveScheduleAsync(Tournament tournament, AdminIdentity.Actor actor, CancellationToken cancellationToken = default) =>
        (await ApproveAsync(tournament.Id, null, actor, cancellationToken)).Result;

    /// <summary>D3 — withdraws the approval: an approver, a compulsory reason; the schedule returns to Draft.</summary>
    public async Task<Outcome> WithdrawApprovalAsync(Tournament tournament, string? reason, AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        var why = reason?.Trim();
        if (string.IsNullOrWhiteSpace(why))
            return Outcome.Invalid("يجب ذكر سبب سحب اعتماد الجدول.", "A reason for withdrawing the schedule approval is required.");
        if (why.Length > 500) return Outcome.Invalid("السبب أطول من 500 حرف.", "Keep the reason to 500 characters.");

        await using var transaction = db.Database.CurrentTransaction is null
            ? await EmailReservations.BeginExclusiveAsync(db, cancellationToken) : null;
        await db.Entry(tournament).ReloadAsync(cancellationToken);
        if (tournament.ScheduleApprovedAt is not { } approvedAt)
            return Outcome.Conflict("الجدول غير معتمد.", "The schedule is not approved, so there is no approval to withdraw.");

        var approvedBy = tournament.ScheduleApprovedBy;
        tournament.ScheduleApprovedAt = null;
        tournament.ScheduleApprovedBy = null;
        tournament.ScheduleStatus = Statuses.Draft;
        tournament.ScheduleRevision++;
        tournament.ScheduleUpdatedAt = DateTime.UtcNow;
        tournament.ScheduleUpdatedBy = actor.Username;
        audit.Write(actor, AuditActions.ScheduleApprovalWithdrawn, "tournament", tournament.Id,
            tournament.NameEn, fromStatus: "schedule_approved", toStatus: "schedule_not_approved",
            details: $"Approval by {approvedBy ?? "unknown"} on {approvedAt:yyyy-MM-dd HH:mm} UTC (revision {tournament.ScheduleApprovedRevision}) withdrawn. "
                     + $"No bout, number, ring or time was changed; the schedule is a Draft again and needs review and approval. Reason: {why}");
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>Accepts the current source brackets as the schedule's base, after the differences were reviewed.</summary>
    public async Task<Outcome> AcknowledgeSourceAsync(int tournamentId, int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is null) return NeedsDraft();
        var changes = SourceChanges(ctx).Where(c => c.Kind != "unpublished").ToList();
        if (changes.Count == 0) return Outcome.Success();
        // Accept the current brackets, but never the absence of a division whose updated draw is still a Draft.
        var accepted = JsonSerializer.Deserialize<Dictionary<string, string>>(AcceptSource(ctx, null)) ?? [];
        foreach (var (key, sig) in SourceSignature(ctx)) accepted[key] = sig;
        ctx.Tournament.ScheduleSourceSnapshot = JsonSerializer.Serialize(accepted);
        Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleSourceAcknowledged, "tournament", tournamentId,
            details: "Source bracket changes reviewed and accepted: " + string.Join("; ", changes.Select(c =>
                $"{c.Label} {c.Kind} (+{c.AddedBoutIds.Count} / −{c.RemovedBoutIds.Count} / changed {c.ChangedBoutIds.Count})"))
                     + ". Unaffected assignments kept; new bouts are unscheduled until assigned.");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    /* exceptions */

    public async Task<Outcome> GrantExceptionAsync(int tournamentId, IReadOnlyCollection<int> athleteRegistrationIds, DateTime date,
        int maxBouts, string? reason, int expectedRevision, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var why = reason?.Trim();
        if (string.IsNullOrWhiteSpace(why)) return Outcome.Invalid("يجب ذكر سبب الاستثناء.", "A written reason is required for an exception.");
        if (why.Length > 500) return Outcome.Invalid("السبب طويل.", "Keep the reason to 500 characters.");
        if (maxBouts is < 2 or > BoutScheduler.MaxBoutsPerAthletePerDay)
            return Outcome.Invalid("الحد غير صالح.", "An exception allows 2 or 3 bouts in a day — never more than 3.");
        if (athleteRegistrationIds.Count == 0) return Outcome.Invalid("اختر لاعبًا.", "Choose at least one athlete.");

        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        if (ctx.Tournament.ScheduleStatus is null) return NeedsDraft();
        if (!ctx.Days.Contains(date.Date)) return Refuse("outside_dates", "التاريخ خارج أيام البطولة.", $"{date:dd MMM yyyy} is not a day of this tournament.", 400);
        var known = ctx.Entries.Values.Select(e => e.AthleteRegistrationId).ToHashSet();
        var unknown = athleteRegistrationIds.Where(id => !known.Contains(id)).ToList();
        if (unknown.Count > 0) return Outcome.Invalid("لاعب غير مشارك.", $"Not an athlete of a published bracket in this tournament: {string.Join(", ", unknown)}.");

        foreach (var person in athleteRegistrationIds.Distinct())
        {
            foreach (var old in ctx.Exceptions.Where(x => x.IsActive && x.AthleteRegistrationId == person && x.Date.Date == date.Date))
            {
                old.RevokedAt = DateTime.UtcNow;
                old.RevokedBy = actor.Username;
                old.RevokeReason = "Replaced by a new exception.";
            }
            db.ScheduleAthleteExceptions.Add(new ScheduleAthleteException
            {
                TournamentId = tournamentId, AthleteRegistrationId = person, Date = date.Date, MaxBouts = maxBouts,
                Reason = why, GrantedBy = actor.Username, GrantedAt = DateTime.UtcNow,
            });
            audit.Write(actor, AuditActions.ScheduleExceptionGranted, "tournament", tournamentId, PersonName(ctx, person),
                toStatus: $"max {maxBouts} bouts",
                details: $"{PersonName(ctx, person)} (athlete #{person}) may have up to {maxBouts} bouts on {date:yyyy-MM-dd}. "
                         + $"Two-hour rest and no-overlap rules still apply. Reason: {why}");
        }
        Touch(ctx.Tournament, actor);
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    public async Task<Outcome> RevokeExceptionAsync(int tournamentId, int exceptionId, string? reason, int expectedRevision,
        AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var why = reason?.Trim();
        if (string.IsNullOrWhiteSpace(why)) return Outcome.Invalid("يجب ذكر السبب.", "A reason is required to revoke an exception.");
        var (transaction, refused) = await GuardAsync(tournamentId, ct, expectedRevision);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, ct);
        var x = ctx.Exceptions.FirstOrDefault(e => e.Id == exceptionId);
        if (x is null) return Outcome.NotFound();
        if (!x.IsActive) return Outcome.Success();
        x.RevokedAt = DateTime.UtcNow;
        x.RevokedBy = actor.Username;
        x.RevokeReason = why;
        Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleExceptionRevoked, "tournament", tournamentId, PersonName(ctx, x.AthleteRegistrationId),
            details: $"Exception for {PersonName(ctx, x.AthleteRegistrationId)} on {x.Date:yyyy-MM-dd} (max {x.MaxBouts}) revoked. Reason: {why}");
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Outcome.Success();
    }

    /* ── legacy endpoints, on the new engine ─────────────────────────────── */

    public async Task<Outcome> UpdateRingAsync(TournamentRing ring, string? name, TimeSpan? firstBoutTime, int? intervalMinutes,
        AdminIdentity.Actor actor, CancellationToken cancellationToken = default)
    {
        var (transaction, refused) = await GuardAsync(ring.TournamentId, cancellationToken);
        if (refused is not null) return refused;
        await using var _ = transaction;
        if (!string.IsNullOrWhiteSpace(name)) ring.Name = name.Trim();
        if (firstBoutTime is not null) ring.FirstBoutTime = firstBoutTime;
        if (intervalMinutes is not null) ring.BoutIntervalMinutes = intervalMinutes;
        audit.Write(actor, AuditActions.ScheduleAmended, "tournament", ring.TournamentId, details: $"Ring {ring.Name} default settings changed.");
        await db.SaveChangesAsync(cancellationToken);
        var regenerated = await GenerateAsync(ring.TournamentId, actor, cancellationToken);
        if (regenerated.Ok && transaction is not null) await transaction.CommitAsync(cancellationToken);
        return regenerated;
    }

    /// <summary>Legacy: a division's ring and/or day; its unlocked, unpinned bouts follow it, then the schedule is re-arranged.</summary>
    public async Task<Outcome> SetDivisionScheduleAsync(TournamentDivision division, int? ringId, DateTime? date,
        TimeSpan? firstBoutTime, int? intervalMinutes, AdminIdentity.Actor actor, CancellationToken cancellationToken = default)
    {
        if (division.DrawPublishedAt is null)
            return Outcome.Conflict("لا يمكن جدولة فئة لم تُعتمد قرعتها.", "A division cannot be scheduled until its draw is published.");
        var (transaction, refused) = await GuardAsync(division.TournamentId, cancellationToken);
        if (refused is not null) return refused;
        await using var _ = transaction;
        if (ringId is { } id && !await db.TournamentRings.AnyAsync(r => r.Id == id && r.TournamentId == division.TournamentId, cancellationToken))
            return Outcome.NotFound();

        division.DefaultRingId = ringId ?? division.DefaultRingId;
        division.ScheduledDate = date ?? division.ScheduledDate;
        division.FirstBoutTime = firstBoutTime ?? division.FirstBoutTime;
        division.BoutIntervalMinutes = intervalMinutes ?? division.BoutIntervalMinutes;
        var bouts = await db.Bouts.Where(b => b.DivisionId == division.Id && !b.IsBye && !b.RingPinned && b.WinnerEntryId == null && !b.IsWalkover)
            .ToListAsync(cancellationToken);
        foreach (var b in bouts)
        {
            b.BoutNumber = null;
            b.OrderInRing = null;
            b.RingId = null;
            b.StartTime = null;
            b.ManualStartTime = null;
            b.ScheduledDate = null;
        }
        audit.Write(actor, AuditActions.ScheduleAmended, "tournament_division", division.Id,
            details: $"Ring {ringId?.ToString() ?? "unchanged"}, date {date?.ToString("yyyy-MM-dd") ?? "unchanged"}.");
        await db.SaveChangesAsync(cancellationToken);
        var regenerated = await GenerateAsync(division.TournamentId, actor, cancellationToken);
        if (regenerated.Ok && transaction is not null) await transaction.CommitAsync(cancellationToken);
        return regenerated;
    }

    /// <summary>Legacy: one bout to another ring and/or day, at the end of the destination queue.</summary>
    public async Task<Outcome> MoveBoutAsync(Bout bout, int? ringId, DateTime? date, AdminIdentity.Actor actor, CancellationToken cancellationToken = default)
    {
        var (transaction, refused) = await GuardAsync(bout.TournamentId, cancellationToken);
        if (refused is not null) return refused;
        await using var _ = transaction;
        if (ringId is { } id && !await db.TournamentRings.AnyAsync(r => r.Id == id && r.TournamentId == bout.TournamentId, cancellationToken))
            return Outcome.NotFound();
        var ctx = await LoadAsync(bout.TournamentId, cancellationToken);
        var tracked = ctx.Bouts.FirstOrDefault(b => b.Id == bout.Id);
        if (tracked is null || tracked.IsBye) return Outcome.Conflict("لا يمكن جدولة هذا النزال.", "This bout cannot be scheduled.");
        if (Locked(tracked)) return Refuse("results_locked", "سُجّلت نتيجة هذا النزال.", "This bout has an official result; its slot is protected.");
        var before = Snapshot(ctx);
        var oldDay = tracked.ScheduledDate?.Date;
        var targetDay = (date ?? tracked.ScheduledDate ?? ctx.Days[0]).Date;
        var targetRing = ringId ?? tracked.RingId ?? ctx.Rings.Where(r => r.IsActive).OrderBy(r => r.SortOrder).Select(r => r.Id).FirstOrDefault();
        var tail = ctx.Bouts.Where(b => b.Id != tracked.Id && b.ScheduledDate?.Date == targetDay && b.RingId == targetRing && b.OrderInRing is not null)
            .Select(b => b.OrderInRing!.Value).DefaultIfEmpty(0).Max();
        tracked.ScheduledDate = targetDay;
        tracked.RingId = targetRing;
        tracked.ManualStartTime = null;
        if (ringId is not null) tracked.RingPinned = true;
        pendingOrder[tracked.Id] = (tail + 1) * 2;
        var days = new List<DateTime> { targetDay };
        if (oldDay is { } d && d != targetDay) days.Add(d);
        var locked = await RecalculateAsync(ctx, days, cancellationToken, before);
        pendingOrder.Clear();
        if (locked is not null) return locked;
        if (ctx.Tournament.ScheduleStatus is not null) Touch(ctx.Tournament, actor);
        audit.Write(actor, AuditActions.ScheduleAmended, "bout", tracked.Id,
            details: $"Moved to ring {ringId?.ToString() ?? "unchanged"}, {date?.ToString("yyyy-MM-dd") ?? "same day"}.");
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>
    /// Legacy "generate" — an auto-arrange helper: every fought bout without a
    /// slot joins a queue (its own day/ring if set, else its division's
    /// defaults, else the first day and first active ring), in category,
    /// weight, round and bracket order; existing queues keep their order; the
    /// affected days are retimed and renumbered by the approved rules. Creates
    /// the Draft if there is none and accepts the current source brackets (an
    /// explicit editor action). Athlete-safety issues are reported and block
    /// approval; the Stage 5 interactive operations refuse them outright.
    /// </summary>
    public async Task<Outcome> GenerateAsync(int tournamentId, AdminIdentity.Actor actor, CancellationToken cancellationToken = default,
        int boutsPerAthletePerDay = BoutScheduler.DefaultBoutsPerAthletePerDay)
    {
        // boutsPerAthletePerDay is kept for the legacy signature; per-athlete exceptions replace it.
        var (transaction, refused) = await GuardAsync(tournamentId, cancellationToken);
        if (refused is not null) return refused;
        await using var _ = transaction;
        var ctx = await LoadAsync(tournamentId, cancellationToken);
        var active = ctx.Rings.Where(r => r.IsActive).OrderBy(r => r.SortOrder).ThenBy(r => r.Id).ToList();
        if (active.Count == 0)
            return Outcome.Conflict("أضف حلبة واحدة على الأقل قبل توليد الجدول.", "Add at least one ring before generating the schedule.");
        var before = Snapshot(ctx);
        var byDivision = ctx.Divisions.ToDictionary(d => d.Id);
        var days = ctx.Days;

        foreach (var group in ctx.Bouts.Where(b => Fought(b) && !Assigned(b))
                     .Select(b =>
                     {
                         var d = byDivision[b.DivisionId];
                         var date = (b.ScheduledDate ?? d.ScheduledDate ?? days[0]).Date;
                         if (!days.Contains(date)) date = days[0];
                         var ring = (b.RingPinned ? b.RingId : null) ?? d.DefaultRingId ?? b.RingId ?? active[0].Id;
                         if (!active.Any(r => r.Id == ring)) ring = active[0].Id;
                         return (Bout: b, Date: date, Ring: ring, d.Category, d.SortWeight);
                     })
                     .GroupBy(x => (x.Date, x.Ring)))
        {
            var tail = ctx.Bouts.Where(b => b.ScheduledDate?.Date == group.Key.Date && b.RingId == group.Key.Ring && b.OrderInRing is not null)
                .Select(b => b.OrderInRing!.Value).DefaultIfEmpty(0).Max();
            foreach (var x in group.OrderBy(x => x.Category, StringComparer.Ordinal).ThenBy(x => x.SortWeight)
                         .ThenBy(x => x.Bout.Round).ThenBy(x => x.Bout.Position))
            {
                x.Bout.ScheduledDate = group.Key.Date;
                x.Bout.RingId = group.Key.Ring;
                x.Bout.ManualStartTime = null;
                pendingOrder[x.Bout.Id] = (++tail) * 2;
            }
        }

        var allDays = ctx.Bouts.Where(b => b.ScheduledDate is not null && b.RingId is not null).Select(b => b.ScheduledDate!.Value.Date).Distinct().ToList();
        var locked = await RecalculateAsync(ctx, allDays, cancellationToken, before);
        pendingOrder.Clear();
        if (locked is not null) return locked;

        var t = ctx.Tournament;
        if (t.ScheduleStatus is null)
        {
            t.ScheduleStatus = Statuses.Draft;
            t.ScheduleCreatedAt = DateTime.UtcNow;
            t.ScheduleCreatedBy = actor.Username;
        }
        t.ScheduleSourceSnapshot = JsonSerializer.Serialize(SourceSignature(ctx));
        Touch(t, actor);
        var issues = Safety(ctx).Count;
        audit.Write(actor, AuditActions.ScheduleGenerated, "tournament", tournamentId, t.NameEn,
            details: $"Auto-arranged: {ctx.Bouts.Count(b => Fought(b) && Assigned(b))} bout(s) across {active.Count} ring(s); numbering grouped by ring, restarting daily"
                     + (issues == 0 ? "." : $"; {issues} athlete-safety issue(s) reported (they block approval)."));
        await db.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Outcome.Success();
    }

    /* ── reading ─────────────────────────────────────────────────────────── */

    public async Task<IReadOnlyList<Issue>> ValidateAsync(int tournamentId, CancellationToken ct = default)
    {
        var ctx = await LoadAsync(tournamentId, ct);
        return ctx.Tournament.ScheduleStatus is null ? [] : Validate(ctx);
    }

    /// <summary>
    /// The Bout Schedule page: header, rings with their per-day timing, the
    /// published divisions (byes included, for context) and every bracket bout
    /// with what a card shows. Red is always the bracket's red corner.
    /// </summary>
    public async Task<object> Stage5ViewAsync(int tournamentId, AdminIdentity.Actor actor, CancellationToken ct = default)
    {
        var ctx = await LoadAsync(tournamentId, ct);
        var t = ctx.Tournament;
        var issues = t.ScheduleStatus is null ? [] : Validate(ctx);
        var changes = SourceChanges(ctx);
        var publication = await CurrentPublicationAsync(tournamentId, ct);
        var unpublished = await db.TournamentDivisions.AsNoTracking()
            .Where(d => d.TournamentId == tournamentId && d.DrawPublishedAt == null && db.Bouts.Any(b => b.DivisionId == d.Id))
            .ToListAsync(ct);

        var roundsOf = ctx.Bouts.GroupBy(b => b.DivisionId).ToDictionary(g => g.Key,
            g => (Total: g.Max(b => b.Round), Partial: g.Any(b => b.Round == 1 && b.IsBye)));
        var feeders = ctx.Bouts.Where(b => b.WinnerToBoutId is not null)
            .GroupBy(b => (b.WinnerToBoutId!.Value, (b.WinnerToCorner ?? "red").ToLowerInvariant()))
            .ToDictionary(g => g.Key, g => g.First());

        object Athlete(int? entryId)
        {
            if (entryId is not { } id || !ctx.Entries.TryGetValue(id, out var e)) return new { entryId };
            var photo = e.AthleteRegistration is null ? null : DrawService.AthletePhotoId(attachments, e.AthleteRegistration.PayloadJson);
            return new
            {
                entryId = id,
                athleteId = e.AthleteRegistrationId,
                nameEn = DrawService.DisplayName(e, false),
                nameAr = DrawService.DisplayName(e, true),
                club = TournamentParticipantsEndpoints.ClubOf(e),
                reference = e.AthleteRegistration?.MembershipNumber ?? e.AthleteRegistration?.ReferenceNumber,
                photo = photo is null ? null : PublicPhotos.Key(photo),
                nationality = NationalityOf(e),
            };
        }

        object? Placeholder(Bout b, string corner)
        {
            var entry = corner == "red" ? b.RedEntryId : b.BlueEntryId;
            if (entry is not null) return null;
            if (!feeders.TryGetValue((b.Id, corner), out var f)) return new { kind = "empty" };
            if (f.IsBye && !f.IsWalkover) return new { kind = "bye", fromBoutId = f.Id };
            return new
            {
                kind = "winner", fromBoutId = f.Id, fromNumber = f.BoutNumber,
                fromDate = f.ScheduledDate?.ToString("yyyy-MM-dd"), fromRound = f.Round, fromPosition = f.Position,
            };
        }

        string RoundName(Bout b, bool ar)
        {
            var r = roundsOf[b.DivisionId];
            var n = BoutRounds.Name(b.Round, r.Total, b.Round == 1 && r.Partial);
            return ar ? n.Ar : n.En;
        }

        var categoryOrder = CompetitionCategories.All.Select(c => c.Value).ToList();
        var divisionById = ctx.Divisions.ToDictionary(d => d.Id);
        return new
        {
            tournament = new
            {
                t.Id, t.NameAr, t.NameEn,
                startDate = t.StartDate.ToString("yyyy-MM-dd"), endDate = t.EndDate.ToString("yyyy-MM-dd"),
                days = ctx.Days.Select(d => d.ToString("yyyy-MM-dd")),
                defaultFirstBoutTime = t.FirstBoutTime.ToString(@"hh\:mm"),
            },
            schedule = new
            {
                status = t.ScheduleStatus,
                requiresReview = changes.Any(NeedsReview),
                revision = t.ScheduleRevision,
                createdAt = t.ScheduleCreatedAt, createdBy = t.ScheduleCreatedBy,
                updatedAt = t.ScheduleUpdatedAt, updatedBy = t.ScheduleUpdatedBy,
                submittedAt = t.ScheduleSubmittedAt, submittedBy = t.ScheduleSubmittedBy,
                approvedAt = t.ScheduleApprovedAt, approvedBy = t.ScheduleApprovedBy, approvedRevision = t.ScheduleApprovedRevision,
            },
            publication = publication is null ? null : new
            {
                publication.Version, publication.PublishedAt, publication.PublishedBy, publication.ScheduleRevision,
                publication.BoutCount, publication.DivisionCount, current = publication.ScheduleRevision == t.ScheduleRevision,
            },
            permissions = new
            {
                publish = actor.Has(AdminPermissions.TournamentSchedulePublish),
                edit = actor.Has(AdminPermissions.TournamentSchedule),
                crossRing = actor.Has(AdminPermissions.TournamentSchedule) && actor.Has(AdminPermissions.TournamentScheduleCrossRing),
                approve = actor.Has(AdminPermissions.TournamentScheduleApprove),
                exceptions = actor.Has(AdminPermissions.TournamentScheduleExceptions),
            },
            rings = ctx.Rings.Select(r => new
            {
                r.Id, r.Name, r.SortOrder, r.IsActive,
                days = ctx.Days.Select(d =>
                {
                    var timing = ctx.Timing(d, r.Id);
                    return new
                    {
                        date = d.ToString("yyyy-MM-dd"),
                        firstBoutTime = timing.First.ToString(@"hh\:mm"), intervalMinutes = timing.Interval, configured = timing.Configured,
                        bouts = ctx.Bouts.Count(b => b.RingId == r.Id && b.ScheduledDate?.Date == d && b.BoutNumber is not null),
                    };
                }),
            }),
            categories = ctx.Divisions.GroupBy(d => d.Category)
                .OrderBy(g => categoryOrder.IndexOf(g.Key) is var i and >= 0 ? i : int.MaxValue)
                .Select(g => new
                {
                    category = g.Key,
                    categoryEn = CompetitionCategories.Label(g.Key).En,
                    categoryAr = CompetitionCategories.Label(g.Key).Ar,
                    divisions = g.OrderBy(d => d.Gender == "female" ? 0 : 1).ThenBy(d => d.SortWeight).Select(d => new
                    {
                        d.Id, d.Gender,
                        labelEn = d.Describe(false), labelAr = d.Describe(true),
                        weightEn = d.WeightLabel(false),
                        defaultRingId = d.DefaultRingId,
                        defaultDate = d.ScheduledDate?.ToString("yyyy-MM-dd"),
                        rounds = roundsOf.TryGetValue(d.Id, out var rr) ? rr.Total : 0,
                        bouts = ctx.Bouts.Count(b => b.DivisionId == d.Id && Fought(b)),
                        scheduled = ctx.Bouts.Count(b => b.DivisionId == d.Id && Fought(b) && Assigned(b)),
                        byes = ctx.Bouts.Count(b => b.DivisionId == d.Id && b.IsBye && !b.IsWalkover),
                        scheduleSavedAt = d.ScheduleSavedAt, scheduleSavedBy = d.ScheduleSavedBy, scheduleSavedRevision = d.ScheduleSavedRevision,
                        scheduleSavedSource = d.ScheduleSavedSource,
                    }),
                }),
            unpublishedDivisions = unpublished.Select(d => new { d.Id, labelEn = d.Describe(false) }),
            bouts = ctx.Bouts.OrderBy(b => b.DivisionId).ThenBy(b => b.Round).ThenBy(b => b.Position).Select(b =>
            {
                var d = divisionById[b.DivisionId];
                return new
                {
                    b.Id, b.DivisionId, b.Round, b.Position,
                    roundEn = RoundName(b, false), roundAr = RoundName(b, true),
                    category = d.Category,
                    categoryEn = CompetitionCategories.Label(d.Category).En,
                    divisionEn = d.Describe(false), weightEn = d.WeightLabel(false), gender = d.Gender,
                    // A walkover is stored as a bye that came from a withdrawal (the draw engine's model); it is not a BYE here.
                    isBye = b.IsBye && !b.IsWalkover, b.IsWalkover, b.WinnerEntryId,
                    status = b.IsWalkover ? "walkover" : b.IsBye ? "bye" : b.WinnerEntryId is not null ? "completed" : Assigned(b) ? "scheduled" : "unscheduled",
                    locked = Locked(b),
                    date = b.ScheduledDate?.ToString("yyyy-MM-dd"),
                    b.RingId,
                    ringName = ctx.Rings.FirstOrDefault(r => r.Id == b.RingId)?.Name,
                    queuePosition = b.OrderInRing,
                    startTime = b.StartTime?.ToString(@"hh\:mm"),
                    manualTime = b.ManualStartTime?.ToString(@"hh\:mm"),
                    number = b.BoutNumber, // internal day-queue key — never displayed as a bout number
                    officialNumber = b.OfficialBoutNumber,
                    red = Athlete(b.RedEntryId),
                    blue = Athlete(b.BlueEntryId),
                    redPlaceholder = b.IsBye && !b.IsWalkover ? null : Placeholder(b, "red"),
                    bluePlaceholder = b.IsBye && !b.IsWalkover ? null : Placeholder(b, "blue"),
                };
            }),
            issues = issues.Select(i => new { i.Code, i.Severity, i.MessageEn, i.MessageAr, i.BoutIds, date = i.Date?.ToString("yyyy-MM-dd"), i.Potential, i.Subject }),
            sourceChanges = changes,
            exceptions = ctx.Exceptions.OrderByDescending(x => x.GrantedAt).Select(x => new
            {
                x.Id, x.AthleteRegistrationId, athlete = PersonName(ctx, x.AthleteRegistrationId),
                date = x.Date.ToString("yyyy-MM-dd"), x.MaxBouts, x.Reason, x.GrantedBy, x.GrantedAt,
                x.RevokedBy, x.RevokedAt, x.RevokeReason, active = x.IsActive,
            }),
            athletes = ctx.Entries.Values.Where(e => e.DivisionId is { } div && divisionById.ContainsKey(div))
                .GroupBy(e => e.AthleteRegistrationId)
                .Select(g => new
                {
                    athleteId = g.Key, name = DrawService.DisplayName(g.First(), false),
                    divisions = g.Select(e => divisionById[e.DivisionId!.Value].Describe(false)).Distinct(),
                })
                .OrderBy(a => a.name),
        };
    }

    /// <summary>The athlete's nationality (ISO 3166-1 alpha-2) from their registration, when readable.</summary>
    internal static string? NationalityOf(TournamentEntry e)
    {
        if (e.AthleteRegistration?.PayloadJson is not { Length: > 0 } json) return null;
        try
        {
            using var payload = JsonDocument.Parse(json);
            return payload.RootElement.TryGetProperty("nationality", out var n) && n.ValueKind == JsonValueKind.String
                && IsoCountries.IsAlpha2(n.GetString()) ? n.GetString()!.ToUpperInvariant() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public async Task<object> HistoryAsync(int tournamentId, CancellationToken ct = default)
    {
        var boutIds = await db.Bouts.Where(b => b.TournamentId == tournamentId).Select(b => b.Id).ToListAsync(ct);
        var divisionIds = await db.TournamentDivisions.Where(d => d.TournamentId == tournamentId).Select(d => d.Id).ToListAsync(ct);
        return await db.AuditLog.AsNoTracking()
            .Where(a => a.Action.StartsWith("tournament.schedule")
                        && ((a.EntityType == "tournament" && a.EntityId == tournamentId)
                            || (a.EntityType == "bout" && boutIds.Contains(a.EntityId))
                            || (a.EntityType == "tournament_division" && divisionIds.Contains(a.EntityId))))
            .OrderByDescending(a => a.Id).Take(500)
            .Select(a => new { a.Id, a.Action, a.EntityType, a.EntityId, a.EntityRef, a.ActorName, a.FromStatus, a.ToStatus, a.Details, a.CreatedAt })
            .ToListAsync(ct);
    }

    /// <summary>The legacy schedule shape (kept for existing API clients), read from what is stored.</summary>
    public async Task<object> ViewAsync(int tournamentId, CancellationToken cancellationToken = default)
    {
        var ctx = await LoadAsync(tournamentId, cancellationToken);
        var tournament = ctx.Tournament;
        string? NameOf(int? entryId, bool arabic) =>
            entryId is { } id && ctx.Entries.TryGetValue(id, out var e) ? DrawService.DisplayName(e, arabic) : null;
        var safety = Safety(ctx);
        return new
        {
            tournament = new
            {
                tournament.Id, tournament.NameAr, tournament.NameEn,
                days = tournament.Days(), firstBoutTime = tournament.FirstBoutTime,
                tournament.ScheduleApprovedAt, tournament.ScheduleApprovedBy,
                scheduleStatus = tournament.ScheduleStatus, scheduleRevision = tournament.ScheduleRevision,
            },
            rings = ctx.Rings.Select(r => new
            {
                r.Id, r.Name, r.SortOrder, r.IsActive,
                firstBoutTime = r.FirstBoutTime ?? tournament.FirstBoutTime,
                intervalMinutes = r.BoutIntervalMinutes ?? DefaultIntervalMinutes,
            }),
            categories = ctx.Divisions.GroupBy(d => d.Category).OrderBy(g => g.Key, StringComparer.Ordinal).Select(group => new
            {
                category = group.Key,
                categoryAr = CompetitionCategories.Label(group.Key).Ar,
                categoryEn = CompetitionCategories.Label(group.Key).En,
                divisions = group.OrderBy(d => d.SortWeight).Select(division => new
                {
                    division.Id,
                    labelAr = division.Describe(arabic: true), labelEn = division.Describe(arabic: false),
                    division.DefaultRingId, division.ScheduledDate, division.FirstBoutTime, division.BoutIntervalMinutes,
                    bouts = ctx.Bouts
                        .Where(b => b.DivisionId == division.Id && (Fought(b) || (b.IsWalkover && b.BoutNumber != null)))
                        .OrderBy(b => b.ScheduledDate).ThenBy(b => b.BoutNumber ?? int.MaxValue)
                        .Select(b => new
                        {
                            b.Id, b.BoutNumber, b.Round, b.Position, b.ScheduledDate, b.RingId,
                            ringName = ctx.Rings.FirstOrDefault(r => r.Id == b.RingId)?.Name,
                            b.StartTime, b.RingPinned, b.IsWalkover, b.WinnerEntryId,
                            red = new { entryId = b.RedEntryId, nameAr = NameOf(b.RedEntryId, true), nameEn = NameOf(b.RedEntryId, false) },
                            blue = new { entryId = b.BlueEntryId, nameAr = NameOf(b.BlueEntryId, true), nameEn = NameOf(b.BlueEntryId, false) },
                        }),
                }),
            }),
            clashes = safety.Select(i => new
            {
                kind = i.Kind switch { "overlap" => "same_time", "max_three" => "daily_limit", _ => i.Kind },
                athleteEntryId = i.PersonId, messageAr = DescribeIssue(ctx, i).Ar, messageEn = DescribeIssue(ctx, i).En, potential = i.Potential,
            }),
        };
    }
}
