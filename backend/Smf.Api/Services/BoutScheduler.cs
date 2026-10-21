namespace Smf.Api.Services;

/// <summary>
/// Turns a set of drawn bouts into a running order — Phase 3 REQ-11.
///
/// The authorised user distributes bouts across the days and the rings; the
/// system works out when each one starts, numbers them, and refuses to let an
/// athlete be in two places at once.
///
/// The rules this holds to:
///
/// <list type="number">
/// <item>Bouts read grouped by category, divisions within it ordered lightest
/// class first, and the bouts under each (rule 2).</item>
/// <item>A ring chosen for a division applies to all of its bouts; a single
/// bout can still be moved on its own, and that choice survives a regeneration
/// (rules 6 and 7).</item>
/// <item>Each ring keeps its own start time, its own interval and its own
/// order, so rings run side by side (rules 9 and 11).</item>
/// <item>Start times are generated, never typed: first bout plus the interval,
/// one after another down the ring (rule 10).</item>
/// <item>Bout numbers run sequentially through the rings within a day and
/// carry on into the next day instead of restarting (rule 12).</item>
/// <item>An athlete has one bout a day by default. Where more are allowed:
/// two hours between them, three in a day at most, and never two at once in
/// different rings (rules 14 to 16).</item>
/// </list>
/// </summary>
public static class BoutScheduler
{
    /// <summary>A ring and the timings it runs to.</summary>
    public sealed record Ring(
        int RingId,
        string Name,
        int SortOrder,
        TimeSpan FirstBoutTime,
        int IntervalMinutes);

    /// <summary>A bout as the scheduler needs to see it.</summary>
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

    /// <summary>Where a bout ends up.</summary>
    public sealed record Slot(
        int BoutId,
        DateTime Date,
        int RingId,
        int OrderInRing,
        TimeSpan StartTime,
        int BoutNumber);

    /// <summary>Something the schedule gets wrong, named so a person can fix it.</summary>
    public sealed record Clash(string Kind, int AthleteEntryId, string MessageAr, string MessageEn);

    public sealed record Plan(IReadOnlyList<Slot> Slots, IReadOnlyList<Clash> Clashes);

    /// <summary>How many bouts one athlete may have in a day (REQ-11 rules 14 and 15).</summary>
    public const int DefaultBoutsPerAthletePerDay = 1;
    public const int MaxBoutsPerAthletePerDay = 3;

    /// <summary>The rest the document requires between two bouts on the same day.</summary>
    public const int MinRestMinutes = 120;

    /// <summary>
    /// Builds the schedule.
    /// </summary>
    /// <param name="bouts">
    /// Only bouts that are actually fought. A bye has no opponent and never
    /// takes a slot.
    /// </param>
    /// <param name="rings">The rings available, in the order they are listed.</param>
    /// <param name="divisionRing">The ring a division defaults to, where one is set.</param>
    /// <param name="divisionDate">The day a division runs on, where one is set.</param>
    /// <param name="days">The tournament's days. A single-day tournament needs no choosing.</param>
    /// <param name="boutsPerAthletePerDay">
    /// One by default. The federation may raise it to at most three, and the
    /// rest rule then applies.
    /// </param>
    public static Plan Build(
        IReadOnlyList<Entry> bouts,
        IReadOnlyList<Ring> rings,
        IReadOnlyDictionary<int, int> divisionRing,
        IReadOnlyDictionary<int, DateTime> divisionDate,
        IReadOnlyList<DateTime> days,
        int boutsPerAthletePerDay = DefaultBoutsPerAthletePerDay)
    {
        if (rings.Count == 0 || bouts.Count == 0 || days.Count == 0) return new Plan([], []);

        var limit = Math.Clamp(boutsPerAthletePerDay, 1, MaxBoutsPerAthletePerDay);
        var ringById = rings.ToDictionary(r => r.RingId);
        var fallbackRing = rings.OrderBy(r => r.SortOrder).First();

        /* ── 1. settle each bout's day and ring ─────────────────────────────
           A bout keeps whatever it was given. Otherwise it takes its
           division's setting, and failing that the first day and the first
           ring — so a schedule always exists and can then be adjusted. */
        var placed = bouts.Select(bout =>
        {
            var date = bout.Date
                ?? (divisionDate.TryGetValue(bout.DivisionId, out var d) ? d : days[0]);
            if (!days.Contains(date.Date)) date = days[0];

            // Rule 7 — a ring set on one bout by hand outranks the division's.
            var ringId = bout.RingPinned && bout.RingId is { } pinned && ringById.ContainsKey(pinned)
                ? pinned
                : divisionRing.TryGetValue(bout.DivisionId, out var divisionsRing) && ringById.ContainsKey(divisionsRing)
                    ? divisionsRing
                    : bout.RingId is { } existing && ringById.ContainsKey(existing)
                        ? existing
                        : fallbackRing.RingId;

            return (Bout: bout, Date: date.Date, RingId: ringId);
        }).ToList();

        /* ── 2. order within each ring ──────────────────────────────────────
           Rule 2's reading order: category, then the lightest division, then
           the bouts of that division in bracket order. */
        var slots = new List<Slot>();

        foreach (var day in days)
        {
            foreach (var ring in rings.OrderBy(r => r.SortOrder).ThenBy(r => r.RingId))
            {
                var inRing = placed
                    .Where(p => p.Date == day.Date && p.RingId == ring.RingId)
                    .OrderBy(p => p.Bout.Category, StringComparer.Ordinal)
                    .ThenBy(p => p.Bout.DivisionSortWeight)
                    .ThenBy(p => p.Bout.Round)
                    .ThenBy(p => p.Bout.Position)
                    .ToList();

                for (var i = 0; i < inRing.Count; i++)
                {
                    // Rule 10 — the time follows from the position in the ring.
                    var start = ring.FirstBoutTime.Add(TimeSpan.FromMinutes((double)i * ring.IntervalMinutes));

                    slots.Add(new Slot(
                        inRing[i].Bout.BoutId,
                        day.Date,
                        ring.RingId,
                        i + 1,
                        start,
                        BoutNumber: 0));
                }
            }
        }

        /* ── 3. number them ─────────────────────────────────────────────────
           Rule 12 — through the rings within a day, then on into the next day
           rather than back to one. */
        var numbered = new List<Slot>(slots.Count);
        var number = 1;

        foreach (var day in days)
        {
            foreach (var ring in rings.OrderBy(r => r.SortOrder).ThenBy(r => r.RingId))
            {
                foreach (var slot in slots
                             .Where(s => s.Date == day.Date && s.RingId == ring.RingId)
                             .OrderBy(s => s.OrderInRing))
                {
                    numbered.Add(slot with { BoutNumber = number++ });
                }
            }
        }

        return new Plan(numbered, FindClashes(numbered, bouts, ringById, limit));
    }

    /// <summary>
    /// What the schedule gets wrong for an athlete: too many bouts in a day,
    /// too little rest between them, or two at the same moment in different
    /// rings (REQ-11 rules 14 to 16).
    /// </summary>
    private static List<Clash> FindClashes(
        IReadOnlyList<Slot> slots,
        IReadOnlyList<Entry> bouts,
        IReadOnlyDictionary<int, Ring> rings,
        int limit)
    {
        var clashes = new List<Clash>();
        var boutById = bouts.ToDictionary(b => b.BoutId);

        // Every bout an athlete is in, with when it starts.
        var byAthlete = new Dictionary<int, List<(DateTime Date, TimeSpan Start, int RingId, int Number)>>();

        foreach (var slot in slots)
        {
            if (!boutById.TryGetValue(slot.BoutId, out var bout)) continue;

            foreach (var athlete in new[] { bout.RedEntryId, bout.BlueEntryId })
            {
                if (athlete is not { } id) continue;
                if (!byAthlete.TryGetValue(id, out var list)) byAthlete[id] = list = [];
                list.Add((slot.Date, slot.StartTime, slot.RingId, slot.BoutNumber));
            }
        }

        foreach (var (athlete, appearances) in byAthlete)
        {
            foreach (var day in appearances.GroupBy(a => a.Date))
            {
                var ordered = day.OrderBy(a => a.Start).ToList();

                if (ordered.Count > limit)
                {
                    clashes.Add(new Clash(
                        "daily_limit",
                        athlete,
                        $"لاعب لديه {ordered.Count} نزالات في يوم {day.Key:yyyy-MM-dd}، والحد المسموح {limit}.",
                        $"This athlete has {ordered.Count} bouts on {day.Key:yyyy-MM-dd}; the limit is {limit}."));
                }

                for (var i = 1; i < ordered.Count; i++)
                {
                    var gap = (ordered[i].Start - ordered[i - 1].Start).TotalMinutes;

                    if (gap <= 0)
                    {
                        clashes.Add(new Clash(
                            "same_time",
                            athlete,
                            $"لاعب له نزالان في الوقت نفسه يوم {day.Key:yyyy-MM-dd} ({ordered[i - 1].Start:hh\\:mm}).",
                            $"This athlete is in two bouts at once on {day.Key:yyyy-MM-dd} at {ordered[i - 1].Start:hh\\:mm}."));
                    }
                    else if (gap < MinRestMinutes)
                    {
                        clashes.Add(new Clash(
                            "rest",
                            athlete,
                            $"الراحة بين نزالي اللاعب يوم {day.Key:yyyy-MM-dd} هي {gap:0} دقيقة، والمطلوب {MinRestMinutes}.",
                            $"Only {gap:0} minutes between this athlete's bouts on {day.Key:yyyy-MM-dd}; {MinRestMinutes} are required."));
                    }
                }
            }
        }

        _ = rings;
        return clashes;
    }
}
