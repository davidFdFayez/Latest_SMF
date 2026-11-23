namespace Smf.Api.Services;

/// <summary>
/// The running order — Phase 3 REQ-11, with the federation's approved
/// Stage 5 decisions (2026-11-19), which supersede the original document where
/// they differ:
///
/// <list type="number">
/// <item><b>Numbering is grouped by ring and restarts every day.</b> For each
/// tournament day the counter starts at 1, numbers Ring 1's queue in order,
/// continues with Ring 2's, and so on through the rings in their configured
/// order. A bout number is unique within its day, not across the tournament.
/// Chronological start times across rings never decide the numbers (the
/// original rule 12 is rejected).</item>
/// <item><b>Each ring has its own timing for each day</b>: first bout start and
/// interval. Start times are generated, never typed: first bout plus the
/// interval times the position in the queue.</item>
/// <item><b>A bye is not a bout</b>: no number, ring, time or queue position.</item>
/// <item><b>Athlete safety</b>: one bout per athlete per day by default; an
/// authorised exception allows at most three, with at least two hours' rest
/// between bouts and never two at once, across every ring. Future-round bouts
/// count for every athlete who could still reach them (progression-aware), so a
/// placeholder never makes a conflict disappear.</item>
/// </list>
///
/// Pure functions only: the service loads the data, this decides, and the
/// service writes the result in one transaction.
/// </summary>
public static class BoutScheduler
{
    /* ── constants (REQ-11 rules 14–16) ─────────────────────────────────── */

    public const int DefaultBoutsPerAthletePerDay = 1;
    public const int MaxBoutsPerAthletePerDay = 3;

    /// <summary>Minimum rest between an athlete's bouts on the same day.</summary>
    public const int MinRestMinutes = 120;

    public const int MinIntervalMinutes = 1;
    public const int MaxIntervalMinutes = 240;

    /* ── recalculation of persisted queues (Stage 5) ────────────────────── */

    /// <summary>A bout's place as stored: which day, which ring, and its order in that ring's queue.</summary>
    /// <param name="Manual">An exact start time entered for this bout; it replaces the computed one for this bout only.</param>
    public sealed record QueueItem(int BoutId, DateTime Date, int RingId, int Order, TimeSpan? Manual = null);

    /// <summary>A ring in its configured order (the order that drives numbering).</summary>
    public sealed record RingOrder(int RingId, int SortOrder);

    /// <summary>Where a bout ends up: compacted queue position, generated start time, daily number.</summary>
    public sealed record Placement(
        int BoutId,
        DateTime Date,
        int RingId,
        int OrderInRing,
        TimeSpan StartTime,
        int IntervalMinutes,
        int BoutNumber);

    /// <summary>
    /// Times and numbers for the given queues.
    ///
    /// Within a ring's day the queue keeps its stored order (ties broken by
    /// bout id, so the result is deterministic) and is compacted to 1..n. The
    /// start of position i is first + (i − 1) × interval. Numbers restart at 1
    /// each day and run ring by ring in ring order. Only the days present in
    /// <paramref name="items"/> are touched, so a caller can recalculate one or
    /// two days without renumbering the rest of the tournament.
    /// </summary>
    public static IReadOnlyList<Placement> Recalculate(
        IEnumerable<QueueItem> items,
        IReadOnlyList<RingOrder> rings,
        Func<DateTime, int, (TimeSpan First, int Interval)> timing)
    {
        var ringRank = rings
            .OrderBy(r => r.SortOrder).ThenBy(r => r.RingId)
            .Select((r, index) => (r.RingId, index))
            .ToDictionary(x => x.RingId, x => x.index);

        var result = new List<Placement>();
        foreach (var day in items.GroupBy(i => i.Date.Date).OrderBy(g => g.Key))
        {
            var number = 1;
            foreach (var ring in day
                         .GroupBy(i => i.RingId)
                         .OrderBy(g => ringRank.TryGetValue(g.Key, out var rank) ? rank : int.MaxValue)
                         .ThenBy(g => g.Key))
            {
                var (first, interval) = timing(day.Key, ring.Key);
                var position = 0;
                foreach (var item in ring.OrderBy(i => i.Order).ThenBy(i => i.BoutId))
                {
                    // A bout keeps its place (and so its number); an exact time entered for it changes its own time only.
                    result.Add(new Placement(
                        item.BoutId, day.Key, ring.Key, position + 1,
                        item.Manual ?? first + TimeSpan.FromMinutes((double)interval * position),
                        interval, number++));
                    position++;
                }
            }
        }

        return result;
    }

    /* ── progression-aware athlete safety (Stage 5) ─────────────────────── */

    /// <summary>A bracket bout as the safety check sees it.</summary>
    public sealed record BracketBout(
        int BoutId,
        int? RedEntryId,
        int? BlueEntryId,
        bool IsBye,
        bool IsWalkover,
        int? WinnerEntryId,
        int? WinnerToBoutId,
        string? WinnerToCorner);

    /// <summary>
    /// For every bout, every entry that is in it or could still reach it.
    ///
    /// A known corner counts as itself. An empty corner counts every entry
    /// that could win the bout feeding it: the winner if that bout is decided,
    /// the athlete of a bye, or — recursively — everybody who could reach the
    /// feeding bout. So a semi-final whose corners read "Winner of Bout 10"
    /// counts both athletes of bout 10 (and, further up, everyone behind them).
    /// </summary>
    public static Dictionary<int, HashSet<int>> PossibleEntrants(IReadOnlyCollection<BracketBout> bouts)
    {
        var byId = bouts.ToDictionary(b => b.BoutId);
        var feeders = bouts
            .Where(b => b.WinnerToBoutId is not null)
            .GroupBy(b => (b.WinnerToBoutId!.Value, (b.WinnerToCorner ?? "red").ToLowerInvariant()))
            .ToDictionary(g => g.Key, g => g.ToList());
        var memo = new Dictionary<int, HashSet<int>>();

        HashSet<int> Winners(BracketBout feeder)
        {
            if (feeder.WinnerEntryId is { } w) return [w];
            if (feeder.IsBye && !feeder.IsWalkover)
            {
                var holder = feeder.RedEntryId ?? feeder.BlueEntryId;
                return holder is { } h ? [h] : [];
            }
            return Of(feeder.BoutId);
        }

        HashSet<int> Corner(int boutId, int? entry, string corner)
        {
            if (entry is { } known) return [known];
            return feeders.TryGetValue((boutId, corner), out var list)
                ? list.SelectMany(Winners).ToHashSet()
                : [];
        }

        HashSet<int> Of(int boutId)
        {
            if (memo.TryGetValue(boutId, out var done)) return done;
            memo[boutId] = []; // cycle guard (a sound bracket has none)
            var bout = byId[boutId];
            var set = Corner(boutId, bout.RedEntryId, "red");
            set.UnionWith(Corner(boutId, bout.BlueEntryId, "blue"));
            memo[boutId] = set;
            return set;
        }

        foreach (var bout in bouts) Of(bout.BoutId);
        return memo;
    }

    /// <summary>One athlete-safety problem on one day.</summary>
    /// <param name="Potential">True when at least one bout involved only might include the athlete (a placeholder).</param>
    public sealed record SafetyIssue(
        string Kind,
        int PersonId,
        DateTime Date,
        IReadOnlyList<int> BoutIds,
        bool Potential,
        int Allowed,
        int Count,
        int? Minutes);

    /// <summary>
    /// What the placed bouts get wrong for any athlete — including athletes who
    /// could only reach a bout through progression (rules 14–16).
    ///
    /// Rest is measured conservatively: a bout is assumed to occupy its whole
    /// slot (start + the ring's interval for that day), because no bout
    /// duration or end time is recorded. Rest is therefore the next start minus
    /// the previous slot's end — never more than the real rest could be.
    /// </summary>
    /// <param name="personOf">An entry's person (its athlete registration), so the same athlete is caught across divisions.</param>
    /// <param name="allowed">Bouts allowed for a person on a day: 1, or an authorised exception's 2 or 3.</param>
    public static List<SafetyIssue> CheckAthletes(
        IReadOnlyList<Placement> placed,
        IReadOnlyDictionary<int, HashSet<int>> possible,
        IReadOnlyDictionary<int, HashSet<int>> certain,
        Func<int, int> personOf,
        Func<int, DateTime, int> allowed)
    {
        var issues = new List<SafetyIssue>();
        var byPerson = new Dictionary<(int Person, DateTime Date), List<(Placement Slot, bool Certain)>>();

        foreach (var slot in placed)
        {
            if (!possible.TryGetValue(slot.BoutId, out var entrants)) continue;
            var sure = certain.TryGetValue(slot.BoutId, out var c) ? c : [];
            // One appearance per person per bout, even if two entries map to the same person.
            foreach (var group in entrants.GroupBy(personOf))
            {
                var key = (group.Key, slot.Date.Date);
                if (!byPerson.TryGetValue(key, out var list)) byPerson[key] = list = [];
                list.Add((slot, group.Any(sure.Contains)));
            }
        }

        foreach (var ((person, date), list) in byPerson)
        {
            if (list.Count < 2) continue;
            var ordered = list.OrderBy(x => x.Slot.StartTime).ThenBy(x => x.Slot.BoutId).ToList();
            var limit = Math.Clamp(allowed(person, date), 1, MaxBoutsPerAthletePerDay);

            if (ordered.Count > limit)
            {
                issues.Add(new SafetyIssue(
                    ordered.Count > MaxBoutsPerAthletePerDay ? "max_three" : "daily_limit",
                    person, date, ordered.Select(x => x.Slot.BoutId).ToList(),
                    ordered.Any(x => !x.Certain), limit, ordered.Count, null));
            }

            for (var i = 1; i < ordered.Count; i++)
            {
                var previous = ordered[i - 1];
                var next = ordered[i];
                var previousEnd = previous.Slot.StartTime + TimeSpan.FromMinutes(previous.Slot.IntervalMinutes);
                var pair = new[] { previous.Slot.BoutId, next.Slot.BoutId };
                var potential = !previous.Certain || !next.Certain;

                if (next.Slot.StartTime < previousEnd)
                {
                    issues.Add(new SafetyIssue("overlap", person, date, pair, potential, limit, ordered.Count, null));
                }
                else
                {
                    var rest = (next.Slot.StartTime - previousEnd).TotalMinutes;
                    if (rest < MinRestMinutes)
                        issues.Add(new SafetyIssue("rest", person, date, pair, potential, limit, ordered.Count, (int)rest));
                }
            }
        }

        return issues
            .OrderBy(i => i.Date).ThenBy(i => i.PersonId).ThenBy(i => i.Kind, StringComparer.Ordinal)
            .ToList();
    }

    /* ── auto-arrange (the legacy "generate" helper) ────────────────────── */

    /// <summary>A ring and its default timing (used by the legacy auto-arrange only).</summary>
    public sealed record Ring(int RingId, string Name, int SortOrder, TimeSpan FirstBoutTime, int IntervalMinutes);

    /// <summary>Kept for the legacy division timing fields; the approved model times bouts by ring and day only.</summary>
    public sealed record DivisionTiming(TimeSpan? FirstBoutTime, int? IntervalMinutes);

    public sealed record Entry(
        int BoutId,
        int DivisionId,
        string Category,
        decimal DivisionSortWeight,
        int Round,
        int Position,
        int? RedEntryId,
        int? BlueEntryId,
        DateTime? Date,
        int? RingId,
        bool RingPinned);

    public sealed record Slot(int BoutId, DateTime Date, int RingId, int OrderInRing, TimeSpan StartTime, int BoutNumber);

    public sealed record Clash(string Kind, int AthleteEntryId, string MessageAr, string MessageEn);

    public sealed record Plan(IReadOnlyList<Slot> Slots, IReadOnlyList<Clash> Clashes);

    /// <summary>
    /// Places every given bout from scratch: its own day and ring if it has
    /// them, else its division's, else the first day and first ring; then
    /// orders each ring's day by category, lightest division, round and
    /// bracket position, times it from the ring's own setting and numbers it by
    /// the approved rule (ring-grouped, restarting every day). Used only by the
    /// legacy "generate" endpoint; the Stage 5 workflow edits persisted queues
    /// and calls <see cref="Recalculate"/>.
    /// </summary>
    public static Plan Build(
        IReadOnlyList<Entry> bouts,
        IReadOnlyList<Ring> rings,
        IReadOnlyDictionary<int, int> divisionRing,
        IReadOnlyDictionary<int, DateTime> divisionDate,
        IReadOnlyList<DateTime> days,
        int boutsPerAthletePerDay = DefaultBoutsPerAthletePerDay,
        IReadOnlyDictionary<int, DivisionTiming>? divisionTiming = null)
    {
        _ = divisionTiming; // superseded by per-ring, per-day timing (approved 2026-11-19)
        if (rings.Count == 0 || bouts.Count == 0 || days.Count == 0) return new Plan([], []);

        var limit = Math.Clamp(boutsPerAthletePerDay, 1, MaxBoutsPerAthletePerDay);
        var ringById = rings.ToDictionary(r => r.RingId);
        var fallbackRing = rings.OrderBy(r => r.SortOrder).ThenBy(r => r.RingId).First();

        var placed = bouts.Select(bout =>
        {
            var date = bout.Date ?? (divisionDate.TryGetValue(bout.DivisionId, out var d) ? d : days[0]);
            if (!days.Contains(date.Date)) date = days[0];
            var ringId = bout.RingPinned && bout.RingId is { } pinned && ringById.ContainsKey(pinned)
                ? pinned
                : divisionRing.TryGetValue(bout.DivisionId, out var divisionsRing) && ringById.ContainsKey(divisionsRing)
                    ? divisionsRing
                    : bout.RingId is { } existing && ringById.ContainsKey(existing)
                        ? existing
                        : fallbackRing.RingId;
            return (Bout: bout, Date: date.Date, RingId: ringId);
        }).ToList();

        var queue = new List<QueueItem>();
        foreach (var group in placed.GroupBy(p => (p.Date, p.RingId)))
        {
            var order = 0;
            foreach (var p in group
                         .OrderBy(p => p.Bout.Category, StringComparer.Ordinal)
                         .ThenBy(p => p.Bout.DivisionSortWeight)
                         .ThenBy(p => p.Bout.Round)
                         .ThenBy(p => p.Bout.Position))
            {
                queue.Add(new QueueItem(p.Bout.BoutId, p.Date, p.RingId, ++order));
            }
        }

        var placements = Recalculate(
            queue,
            rings.Select(r => new RingOrder(r.RingId, r.SortOrder)).ToList(),
            (_, ringId) => (ringById[ringId].FirstBoutTime, ringById[ringId].IntervalMinutes));

        var slots = placements
            .Select(p => new Slot(p.BoutId, p.Date, p.RingId, p.OrderInRing, p.StartTime, p.BoutNumber))
            .ToList();
        return new Plan(slots, FindClashes(placements, bouts, limit));
    }

    /// <summary>Clashes among known athletes, for the legacy auto-arrange report (same rules, conservative rest).</summary>
    private static List<Clash> FindClashes(IReadOnlyList<Placement> placements, IReadOnlyList<Entry> bouts, int limit)
    {
        var known = bouts.ToDictionary(
            b => b.BoutId,
            b => new[] { b.RedEntryId, b.BlueEntryId }.OfType<int>().ToHashSet());
        var issues = CheckAthletes(placements, known, known, entry => entry, (_, _) => limit);
        return issues.Select(i => new Clash(
            i.Kind switch { "overlap" => "same_time", "max_three" => "daily_limit", _ => i.Kind },
            i.PersonId,
            i.Kind switch
            {
                "overlap" => $"لاعب له نزالان متداخلان يوم {i.Date:yyyy-MM-dd}.",
                "rest" => $"الراحة بين نزالي اللاعب يوم {i.Date:yyyy-MM-dd} هي {i.Minutes} دقيقة، والمطلوب {MinRestMinutes}.",
                _ => $"لاعب لديه {i.Count} نزالات في يوم {i.Date:yyyy-MM-dd}، والحد المسموح {i.Allowed}.",
            },
            i.Kind switch
            {
                "overlap" => $"This athlete has overlapping bouts on {i.Date:yyyy-MM-dd}.",
                "rest" => $"Only {i.Minutes} minutes' rest between this athlete's bouts on {i.Date:yyyy-MM-dd}; {MinRestMinutes} are required.",
                _ => $"This athlete has {i.Count} bouts on {i.Date:yyyy-MM-dd}; the limit is {i.Allowed}.",
            })).ToList();
    }
}
