using System.Diagnostics;
using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// Stage 5 (REQ-11, approved 2026-11-19): per-ring/per-day timing, ring-grouped
/// daily numbering, renumbering on change, and progression-aware athlete safety.
/// Test ids follow the requested matrix (C, D, E, F).
/// </summary>
public static class Stage5ScheduleTests
{
    public static List<string> Run()
    {
        var failures = new List<string>();
        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        var d1 = new DateTime(2026, 12, 15);
        var d2 = new DateTime(2026, 12, 16);
        const int A = 1, B = 2, C = 3;
        var rings = new List<BoutScheduler.RingOrder> { new(A, 1), new(B, 2), new(C, 3) };
        var timing = new Dictionary<(DateTime, int), (TimeSpan, int)>
        {
            [(d1, A)] = (new TimeSpan(15, 0, 0), 10),
            [(d1, B)] = (new TimeSpan(15, 0, 0), 15),
            [(d1, C)] = (new TimeSpan(16, 0, 0), 12),
            [(d2, A)] = (new TimeSpan(10, 0, 0), 10),
            [(d2, B)] = (new TimeSpan(11, 0, 0), 15),
        };
        (TimeSpan, int) T(DateTime d, int r) => timing[(d, r)];

        List<BoutScheduler.QueueItem> Queue(DateTime day, int ring, int firstId, int count) =>
            Enumerable.Range(0, count).Select(i => new BoutScheduler.QueueItem(firstId + i, day, ring, i + 1)).ToList();
        string Show(IEnumerable<BoutScheduler.Placement> p, DateTime day, int ring) =>
            string.Join(",", p.Where(x => x.Date == day && x.RingId == ring).OrderBy(x => x.OrderInRing).Select(x => x.BoutNumber));
        string Times(IEnumerable<BoutScheduler.Placement> p, DateTime day, int ring) =>
            string.Join(",", p.Where(x => x.Date == day && x.RingId == ring).OrderBy(x => x.OrderInRing).Select(x => x.StartTime.ToString(@"hh\:mm")));

        var baseQueue = new List<BoutScheduler.QueueItem>();
        baseQueue.AddRange(Queue(d1, A, 100, 5));
        baseQueue.AddRange(Queue(d1, B, 200, 5));
        baseQueue.AddRange(Queue(d1, C, 300, 3));
        baseQueue.AddRange(Queue(d2, A, 400, 4));
        baseQueue.AddRange(Queue(d2, B, 500, 6));

        Console.WriteLine();
        Console.WriteLine("=== Stage 5 D: each ring has its own timing for each day ===");
        {
            var p = BoutScheduler.Recalculate(baseQueue, rings, T);
            Check("D01 Ring A day 1 starts 15:00", Times(p, d1, A).StartsWith("15:00"), Times(p, d1, A));
            Check("D02 Ring B day 1 starts 15:00", Times(p, d1, B).StartsWith("15:00"), Times(p, d1, B));
            Check("D03 Ring A day 2 starts 10:00", Times(p, d2, A).StartsWith("10:00"), Times(p, d2, A));
            Check("D04 Ring B day 2 starts 11:00", Times(p, d2, B).StartsWith("11:00"), Times(p, d2, B));
            Check("D05 ten-minute interval (Ring A day 1: 15:00,15:10,15:20,…)", Times(p, d1, A) == "15:00,15:10,15:20,15:30,15:40", Times(p, d1, A));
            Check("D06 fifteen-minute interval (Ring B day 1: 15:00,15:15,15:30,…)", Times(p, d1, B) == "15:00,15:15,15:30,15:45,16:00", Times(p, d1, B));
            var later = new Dictionary<(DateTime, int), (TimeSpan, int)>(timing) { [(d1, A)] = (new TimeSpan(16, 0, 0), 10) };
            var p2 = BoutScheduler.Recalculate(baseQueue, rings, (d, r) => later[(d, r)]);
            Check("D07 changing the start time recalculates the times", Times(p2, d1, A) == "16:00,16:10,16:20,16:30,16:40", Times(p2, d1, A));
            var wider = new Dictionary<(DateTime, int), (TimeSpan, int)>(timing) { [(d1, A)] = (new TimeSpan(15, 0, 0), 20) };
            var p3 = BoutScheduler.Recalculate(baseQueue, rings, (d, r) => wider[(d, r)]);
            Check("D08 changing the interval recalculates the times", Times(p3, d1, A) == "15:00,15:20,15:40,16:00,16:20", Times(p3, d1, A));
            Check("D08b numbers do not change when only timing changes", Show(p3, d1, A) == Show(p, d1, A) && Show(p3, d1, B) == Show(p, d1, B));
            Check("D09 the interval bounds are 1..240 minutes", BoutScheduler.MinIntervalMinutes == 1 && BoutScheduler.MaxIntervalMinutes == 240);
            Check("D10 the same time on different rings is allowed (rings run in parallel)",
                p.Single(x => x.Date == d1 && x.RingId == A && x.OrderInRing == 1).StartTime == p.Single(x => x.Date == d1 && x.RingId == B && x.OrderInRing == 1).StartTime);
        }

        Console.WriteLine();
        Console.WriteLine("=== Stage 5 E: bout numbering grouped by ring, restarting every day ===");
        {
            var p = BoutScheduler.Recalculate(baseQueue, rings, T);
            Check("E01 Ring A with five bouts: 1–5", Show(p, d1, A) == "1,2,3,4,5", Show(p, d1, A));
            Check("E02 Ring B with five bouts: 6–10", Show(p, d1, B) == "6,7,8,9,10", Show(p, d1, B));
            Check("E03 Ring C with three bouts: 11–13", Show(p, d1, C) == "11,12,13", Show(p, d1, C));
            Check("E04 day 2 starts again at 1 (Ring A 1–4, Ring B 5–10, not 14…)", Show(p, d2, A) == "1,2,3,4" && Show(p, d2, B) == "5,6,7,8,9,10",
                Show(p, d2, A) + " | " + Show(p, d2, B));

            var withSixth = baseQueue.Append(new BoutScheduler.QueueItem(999, d1, A, 6)).ToList();
            var p5 = BoutScheduler.Recalculate(withSixth, rings, T);
            Check("E05 a sixth bout in Ring A shifts Ring B to start at 7 (A 1–6, B 7–11, C 12–14)",
                Show(p5, d1, A) == "1,2,3,4,5,6" && Show(p5, d1, B) == "7,8,9,10,11" && Show(p5, d1, C) == "12,13,14",
                $"{Show(p5, d1, A)} | {Show(p5, d1, B)} | {Show(p5, d1, C)}");

            var moved = baseQueue.Select(q => q.BoutId == 103 ? q with { RingId = B, Order = 99 } : q).ToList();
            var p6 = BoutScheduler.Recalculate(moved, rings, T);
            Check("E06 moving a bout from Ring A to Ring B renumbers both (A 1–4, B 5–10)",
                Show(p6, d1, A) == "1,2,3,4" && Show(p6, d1, B) == "5,6,7,8,9,10" && p6.Single(x => x.BoutId == 103).BoutNumber == 10,
                $"{Show(p6, d1, A)} | {Show(p6, d1, B)}");

            var reordered = baseQueue.Select(q => q.BoutId == 104 ? q with { Order = 0 } : q).ToList();
            var p7 = BoutScheduler.Recalculate(reordered, rings, T);
            Check("E07 reordering within Ring A updates the numbers (bout 104 becomes #1, 100 becomes #2)",
                p7.Single(x => x.BoutId == 104).BoutNumber == 1 && p7.Single(x => x.BoutId == 100).BoutNumber == 2
                && p7.Single(x => x.BoutId == 104).StartTime == new TimeSpan(15, 0, 0));

            var toDay2 = baseQueue.Select(q => q.BoutId == 200 ? q with { Date = d2, RingId = A, Order = 99 } : q).ToList();
            var p8 = BoutScheduler.Recalculate(toDay2, rings, T);
            Check("E08 moving a bout to day 2 renumbers both days (day 1: B 6–9, C 10–12; day 2: A 1–5, B 6–11)",
                Show(p8, d1, B) == "6,7,8,9" && Show(p8, d1, C) == "10,11,12" && Show(p8, d2, A) == "1,2,3,4,5" && Show(p8, d2, B) == "6,7,8,9,10,11",
                $"{Show(p8, d1, B)} | {Show(p8, d1, C)} | {Show(p8, d2, A)} | {Show(p8, d2, B)}");

            Check("E10 no gaps: each day is 1..n", p.GroupBy(x => x.Date).All(g => g.Select(x => x.BoutNumber).OrderBy(n => n).SequenceEqual(Enumerable.Range(1, g.Count()))));
            Check("E11 no duplicate numbers within a day", p.GroupBy(x => x.Date).All(g => g.Select(x => x.BoutNumber).Distinct().Count() == g.Count()));
            Check("E12 the same number on different days is valid", p.Count(x => x.BoutNumber == 1) == 2);

            var earlyB = new Dictionary<(DateTime, int), (TimeSpan, int)>(timing) { [(d1, B)] = (new TimeSpan(9, 0, 0), 15) };
            var p13 = BoutScheduler.Recalculate(baseQueue, rings, (d, r) => earlyB[(d, r)]);
            Check("E13 a ring that starts earlier does not take the earlier numbers (B at 09:00 still 6–10)",
                Show(p13, d1, B) == "6,7,8,9,10" && Show(p13, d1, A) == "1,2,3,4,5");

            var shuffled = baseQueue.OrderByDescending(q => q.BoutId).ToList();
            var again = BoutScheduler.Recalculate(shuffled, rings, T);
            Check("E15 recalculation is deterministic (input order does not matter)",
                p.OrderBy(x => x.BoutId).SequenceEqual(again.OrderBy(x => x.BoutId)));

            var swapped = new List<BoutScheduler.RingOrder> { new(A, 2), new(B, 1), new(C, 3) };
            var pr = BoutScheduler.Recalculate(baseQueue, swapped, T);
            Check("C08 ring ORDER (not id or name) drives numbering: B first when B is ordered first",
                Show(pr, d1, B) == "1,2,3,4,5" && Show(pr, d1, A) == "6,7,8,9,10");

            var gaps = baseQueue.Select(q => q with { Order = q.Order * 7 }).ToList();
            var pg = BoutScheduler.Recalculate(gaps, rings, T);
            Check("queue positions are compacted to 1..n", pg.Where(x => x.Date == d1 && x.RingId == A).Select(x => x.OrderInRing).SequenceEqual([1, 2, 3, 4, 5]));

            var onlyDay2 = BoutScheduler.Recalculate(baseQueue.Where(q => q.Date == d2), rings, T);
            Check("recalculating one day touches only that day", onlyDay2.All(x => x.Date == d2) && Show(onlyDay2, d2, A) == "1,2,3,4");
        }

        Console.WriteLine();
        Console.WriteLine("=== Stage 5 F: athlete safety — limits, rest, overlap, exceptions, progression ===");
        {
            BoutScheduler.Placement P(int id, DateTime d, int ring, string start, int interval = 10) =>
                new(id, d, ring, 1, TimeSpan.Parse(start), interval, id);
            Dictionary<int, HashSet<int>> Sets(params (int Bout, int[] Entries)[] x) => x.ToDictionary(v => v.Bout, v => v.Entries.ToHashSet());

            var twoBouts = new[] { P(1, d1, A, "15:00"), P(2, d1, B, "18:00") };
            var people = Sets((1, [7, 8]), (2, [7, 9]));
            var f01 = BoutScheduler.CheckAthletes(twoBouts, people, people, e => e, (_, _) => 1);
            Check("F01/F02 default one bout a day: a second bout is a violation", f01.Any(i => i.Kind == "daily_limit" && i.PersonId == 7), string.Join(";", f01.Select(i => i.Kind)));
            var f05 = BoutScheduler.CheckAthletes(twoBouts, people, people, e => e, (_, _) => 2);
            Check("F05 with an exception (2) and ≥2 h rest: accepted", f05.Count == 0, string.Join(";", f05.Select(i => i.Kind)));
            var close = new[] { P(1, d1, A, "15:00"), P(2, d1, B, "16:30") };
            var f06 = BoutScheduler.CheckAthletes(close, people, people, e => e, (_, _) => 2);
            Check("F06 less than 2 h rest is rejected (80 min after the 10-min slot ends)", f06.Any(i => i.Kind == "rest" && i.Minutes == 80), string.Join(";", f06.Select(i => $"{i.Kind}:{i.Minutes}")));
            var exactly = new[] { P(1, d1, A, "15:00"), P(2, d1, B, "17:10") };
            Check("F05b exactly 120 min after the slot ends is accepted",
                BoutScheduler.CheckAthletes(exactly, people, people, e => e, (_, _) => 2).Count == 0);
            var three = new[] { P(1, d1, A, "09:00"), P(2, d1, A, "12:00"), P(3, d1, B, "15:00") };
            var p3 = Sets((1, [7, 8]), (2, [7, 9]), (3, [7, 10]));
            Check("F07 three bouts with an exception of 3 and enough rest: accepted",
                BoutScheduler.CheckAthletes(three, p3, p3, e => e, (_, _) => 3).Count == 0);
            var four = three.Append(P(4, d1, C, "18:00")).ToArray();
            var p4 = Sets((1, [7, 8]), (2, [7, 9]), (3, [7, 10]), (4, [7, 11]));
            var f08 = BoutScheduler.CheckAthletes(four, p4, p4, e => e, (_, _) => 3);
            Check("F08/F12 a fourth bout is rejected even with an exception (never more than 3)", f08.Any(i => i.Kind == "max_three" && i.Count == 4));
            var f12 = BoutScheduler.CheckAthletes(four, p4, p4, e => e, (_, _) => 99);
            Check("F12b an exception value above 3 is clamped to 3", f12.Any(i => i.Kind == "max_three"));
            var overlap = new[] { P(1, d1, A, "15:00"), P(2, d1, B, "15:05") };
            var f09 = BoutScheduler.CheckAthletes(overlap, people, people, e => e, (_, _) => 3);
            Check("F09/F11 cross-ring overlap is detected and an exception does not bypass it", f09.Any(i => i.Kind == "overlap"), string.Join(";", f09.Select(i => i.Kind)));
            var otherDays = new[] { P(1, d1, A, "15:00"), P(2, d2, A, "15:00") };
            Check("bouts on different days do not conflict", BoutScheduler.CheckAthletes(otherDays, people, people, e => e, (_, _) => 1).Count == 0);

            // F10 — progression: a quarter-final pair feeding a semi-final, with byes.
            //   QF1 (11 v 12) ─┐
            //                   ├─ SF (winner QF1 v winner QF2)
            //   QF2 (13 v BYE) ─┘   (13 advances via the bye)
            var bracket = new List<BoutScheduler.BracketBout>
            {
                new(1, 11, 12, false, false, null, 3, "red"),
                new(2, 13, null, true, false, null, 3, "blue"),
                new(3, null, null, false, false, null, null, null),
            };
            var possible = BoutScheduler.PossibleEntrants(bracket);
            Check("B08/F10 the semi-final's possible entrants are 11 and 12 (winner of QF1) and 13 (via the BYE)",
                possible[3].SetEquals([11, 12, 13]), string.Join(",", possible[3]));
            var certain = bracket.ToDictionary(b => b.BoutId, b => new[] { b.RedEntryId, b.BlueEntryId }.OfType<int>().ToHashSet());
            var sameDay = new[] { P(1, d1, A, "15:00"), P(3, d1, A, "20:00") };
            var f10 = BoutScheduler.CheckAthletes(sameDay, possible, certain, e => e, (_, _) => 1);
            Check("F10 QF and its SF on the same day: a POTENTIAL daily-limit conflict for 11 and 12 (placeholder not treated as conflict-free)",
                f10.Count(i => i.Kind == "daily_limit" && i.Potential) == 2 && f10.All(i => i.PersonId != 13),
                string.Join(";", f10.Select(i => $"{i.PersonId}:{i.Kind}:{(i.Potential ? "potential" : "certain")}")));
            var decided = bracket.Select(b => b.BoutId == 1 ? b with { WinnerEntryId = 12 } : b).ToList();
            var after = BoutScheduler.PossibleEntrants(decided);
            Check("B09/I01 once QF1 is decided, only its winner can reach the SF", after[3].SetEquals([12, 13]), string.Join(",", after[3]));
            Check("B07/E09 a BYE carries its athlete forward but is never placed (no slot is given to bout 2)",
                !sameDay.Any(x => x.BoutId == 2));
        }

        Console.WriteLine();
        Console.WriteLine("=== Stage 5 scale: a full championship ===");
        {
            // 48 divisions × 16 athletes = 768 athletes, 720 bouts, 4 rounds, over 3 days × 3 rings.
            var bracket = new List<BoutScheduler.BracketBout>();
            var queue = new List<BoutScheduler.QueueItem>();
            var days = new[] { d1, d2, d2.AddDays(1) };
            var entry = 1;
            var id = 1;
            var order = new Dictionary<(DateTime, int), int>();
            for (var div = 0; div < 48; div++)
            {
                var r1 = Enumerable.Range(0, 8).Select(_ => id++).ToList();
                var r2 = Enumerable.Range(0, 4).Select(_ => id++).ToList();
                var r3 = Enumerable.Range(0, 2).Select(_ => id++).ToList();
                var fin = id++;
                for (var i = 0; i < 8; i++) bracket.Add(new(r1[i], entry++, entry++, false, false, null, r2[i / 2], i % 2 == 0 ? "red" : "blue"));
                for (var i = 0; i < 4; i++) bracket.Add(new(r2[i], null, null, false, false, null, r3[i / 2], i % 2 == 0 ? "red" : "blue"));
                for (var i = 0; i < 2; i++) bracket.Add(new(r3[i], null, null, false, false, null, fin, i == 0 ? "red" : "blue"));
                bracket.Add(new(fin, null, null, false, false, null, null, null));
                var ring = div % 3 + 1;
                foreach (var (ids, day) in new[] { (r1, days[0]), (r2, days[1]), (r3.Append(fin).ToList(), days[2]) })
                    foreach (var b in ids)
                    {
                        var key = (day, ring);
                        order[key] = order.GetValueOrDefault(key) + 1;
                        queue.Add(new(b, day, ring, order[key]));
                    }
            }
            var sw = Stopwatch.StartNew();
            var placed = BoutScheduler.Recalculate(queue, rings, (_, _) => (new TimeSpan(9, 0, 0), 4));
            var possible = BoutScheduler.PossibleEntrants(bracket);
            var certain = bracket.ToDictionary(b => b.BoutId, b => new[] { b.RedEntryId, b.BlueEntryId }.OfType<int>().ToHashSet());
            var issues = BoutScheduler.CheckAthletes(placed, possible, certain, e => e, (_, _) => 1);
            sw.Stop();
            Check($"720 bouts / 768 athletes placed, numbered and safety-checked in {sw.ElapsedMilliseconds} ms (< 2000)",
                placed.Count == 720 && sw.ElapsedMilliseconds < 2000, $"{placed.Count} placed");
            Check("semi-finals and finals on the same day are flagged for every athlete who could reach both (potential)",
                issues.Count > 0 && issues.All(i => i.Potential && i.Date == days[2]), $"{issues.Count} issues");
            Check("each day numbered 1..n without gaps", placed.GroupBy(p => p.Date).All(g => g.Select(x => x.BoutNumber).OrderBy(n => n).SequenceEqual(Enumerable.Range(1, g.Count()))));
        }

        return failures;
    }
}
