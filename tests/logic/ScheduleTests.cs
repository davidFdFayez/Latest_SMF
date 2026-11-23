using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>The running order, against the rules REQ-11 states.</summary>
public static class ScheduleTests
{
    public static int Run()
    {
        // Checks the schedule against the rules REQ-11 states.

        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        var day1 = new DateTime(2026, 11, 6);
        var day2 = new DateTime(2026, 11, 7);

        static BoutScheduler.Ring RingOf(int id, string name, int order, int hour, int interval) =>
            new(id, name, order, new TimeSpan(hour, 0, 0), interval);

        var ringA = RingOf(1, "Ring A", 1, 17, 15);
        var ringB = RingOf(2, "Ring B", 2, 17, 20);

        // Six bouts in one division, two athletes each, nobody repeated.
        static List<BoutScheduler.Entry> Bouts(int count, int divisionId = 10, string category = "u18",
                                               decimal weight = 45, int firstAthlete = 100) =>
            Enumerable.Range(0, count).Select(i => new BoutScheduler.Entry(
                BoutId: divisionId * 100 + i,
                DivisionId: divisionId,
                Category: category,
                DivisionSortWeight: weight,
                Round: 1,
                Position: i + 1,
                RedEntryId: firstAthlete + (i * 2),
                BlueEntryId: firstAthlete + (i * 2) + 1,
                Date: null,
                RingId: null,
                RingPinned: false)).ToList();

        Console.WriteLine("=== rule 10: times are generated from the ring's own settings ===");
        {
            var plan = BoutScheduler.Build(Bouts(3), [ringA],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1]);

            var times = plan.Slots.OrderBy(s => s.OrderInRing).Select(s => s.StartTime.ToString(@"hh\:mm")).ToList();
            Check("15-minute interval from 17:00", string.Join(", ", times) == "17:00, 17:15, 17:30",
                string.Join(", ", times));
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 9: each ring keeps its own start time and interval ===");
        {
            var bouts = Bouts(2, 10, "u18", 45).Concat(Bouts(2, 20, "u18", 48, 200)).ToList();
            var plan = BoutScheduler.Build(bouts, [ringA, ringB],
                new Dictionary<int, int> { [10] = 1, [20] = 2 }, new Dictionary<int, DateTime>(), [day1]);

            var a = plan.Slots.Where(s => s.RingId == 1).OrderBy(s => s.OrderInRing)
                .Select(s => s.StartTime.ToString(@"hh\:mm")).ToList();
            var b = plan.Slots.Where(s => s.RingId == 2).OrderBy(s => s.OrderInRing)
                .Select(s => s.StartTime.ToString(@"hh\:mm")).ToList();

            Check("Ring A runs at 15-minute intervals", string.Join(", ", a) == "17:00, 17:15", string.Join(", ", a));
            Check("Ring B runs at 20-minute intervals", string.Join(", ", b) == "17:00, 17:20", string.Join(", ", b));
        }

        Console.WriteLine();
        Console.WriteLine("=== approved numbering (Stage 5): grouped by ring, restarting every day (old rule 12 rejected) ===");
        {
            // Three bouts in each of two rings on day one, two on day two (the old rule 12 fixture).
            var dayOne = Bouts(3, 10, "u18", 45, 100).Select(b => b with { Date = day1 }).ToList();
            var dayOneB = Bouts(3, 20, "u18", 48, 200).Select(b => b with { Date = day1 }).ToList();
            var dayTwo = Bouts(2, 30, "u18", 51, 300).Select(b => b with { Date = day2 }).ToList();

            var plan = BoutScheduler.Build(
                [.. dayOne, .. dayOneB, .. dayTwo], [ringA, ringB],
                new Dictionary<int, int> { [10] = 1, [20] = 2, [30] = 1 },
                new Dictionary<int, DateTime>(), [day1, day2]);

            string Label(BoutScheduler.Slot s) => $"{(s.Date == day1 ? "D1" : "D2")} {(s.RingId == 1 ? "A" : "B")}#{s.BoutNumber}";
            var numbers = plan.Slots.OrderBy(s => s.Date).ThenBy(s => s.BoutNumber).Select(Label).ToList();

            Check("day one numbers Ring A first (1-3), then Ring B (4-6) — not interleaved by the clock",
                string.Join(" ", numbers.Take(6)) == "D1 A#1 D1 A#2 D1 A#3 D1 B#4 D1 B#5 D1 B#6",
                string.Join(" ", numbers.Take(6)));
            Check("day two restarts at 1 (it does not carry on from 7)",
                string.Join(" ", numbers.Skip(6)) == "D2 A#1 D2 A#2",
                string.Join(" ", numbers.Skip(6)));

            // A later ring that starts earlier is still numbered after the earlier ring.
            var early = RingOf(2, "Ring B", 2, 14, 30);
            var crossed = BoutScheduler.Build(
                [.. Bouts(1, 10, "u18", 45, 100), .. Bouts(1, 20, "u18", 48, 200)],
                [ringA, early],
                new Dictionary<int, int> { [10] = 1, [20] = 2 },
                new Dictionary<int, DateTime>(), [day1]);
            var first = crossed.Slots.Single(x => x.BoutNumber == 1);
            Check("Ring B at 14:00 is still numbered after Ring A at 17:00 (start time does not decide numbers)",
                first.RingId == 1 && crossed.Slots.Single(x => x.BoutNumber == 2).RingId == 2,
                $"#1 is ring {first.RingId}");
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 2: lightest division first, bracket order within it ===");
        {
            var heavy = Bouts(2, 20, "u18", 71, 200);
            var light = Bouts(2, 10, "u18", 45, 100);

            var plan = BoutScheduler.Build([.. heavy, .. light], [ringA],
                new Dictionary<int, int> { [10] = 1, [20] = 1 }, new Dictionary<int, DateTime>(), [day1]);

            var order = plan.Slots.OrderBy(s => s.OrderInRing).Select(s => s.BoutId / 100).ToList();
            Check("the 45 kg division is scheduled before the 71 kg one",
                order[0] == 10 && order[1] == 10 && order[2] == 20 && order[3] == 20,
                string.Join(", ", order));
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 7: a ring set on one bout survives the division's setting ===");
        {
            var bouts = Bouts(3, 10, "u18", 45);
            bouts[1] = bouts[1] with { RingId = 2, RingPinned = true };

            var plan = BoutScheduler.Build(bouts, [ringA, ringB],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1]);

            var moved = plan.Slots.Single(s => s.BoutId == bouts[1].BoutId);
            var others = plan.Slots.Where(s => s.BoutId != bouts[1].BoutId).Select(s => s.RingId).Distinct().ToList();

            Check("the pinned bout stays in Ring B", moved.RingId == 2);
            Check("the rest follow the division into Ring A", others.Count == 1 && others[0] == 1);
            Check("Ring A renumbers around the gap",
                plan.Slots.Where(s => s.RingId == 1).OrderBy(s => s.OrderInRing)
                    .Select(s => s.StartTime.ToString(@"hh\:mm")).SequenceEqual(["17:00", "17:15"]));
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 14: one bout per athlete per day, by default ===");
        {
            // The same athlete drawn into two bouts on one day.
            var bouts = Bouts(2, 10, "u18", 45);
            bouts[1] = bouts[1] with { RedEntryId = bouts[0].RedEntryId };

            var plan = BoutScheduler.Build(bouts, [ringA],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1]);

            Check("the clash is reported", plan.Clashes.Any(c => c.Kind == "daily_limit"),
                string.Join("; ", plan.Clashes.Select(c => c.Kind)));
            Check("it names the athlete", plan.Clashes.First(c => c.Kind == "daily_limit").AthleteEntryId == 100);
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 15: two hours between bouts when more than one is allowed ===");
        {
            var bouts = Bouts(2, 10, "u18", 45);
            bouts[1] = bouts[1] with { RedEntryId = bouts[0].RedEntryId };

            // 15 minutes apart, two allowed per day: too little rest.
            var tight = BoutScheduler.Build(bouts, [ringA],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1],
                boutsPerAthletePerDay: 2);
            Check("15 minutes apart is refused", tight.Clashes.Any(c => c.Kind == "rest"));
            Check("the daily limit is not also complained about", !tight.Clashes.Any(c => c.Kind == "daily_limit"));

            // Rest is measured conservatively (a bout occupies its whole slot): with a 180-minute slot
            // the next start is 0 minutes after the previous slot ends — refused, not "three hours of rest".
            var slotLong = BoutScheduler.Build(
                [bouts[0], bouts[1]],
                [RingOf(1, "Ring A", 1, 17, 180)],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1],
                boutsPerAthletePerDay: 2);
            Check("starts three hours apart but a 180-minute slot leaves no rest: refused (conservative model)",
                slotLong.Clashes.Any(c => c.Kind == "rest"), string.Join("; ", slotLong.Clashes.Select(c => c.Kind)));
            // Starts 2 h 10 min apart with a 10-minute slot: exactly two hours of rest — accepted.
            var roomy = BoutScheduler.CheckAthletes(
                [new(bouts[0].BoutId, day1, 1, 1, new TimeSpan(15, 0, 0), 10, 1),
                 new(bouts[1].BoutId, day1, 1, 14, new TimeSpan(17, 10, 0), 10, 14)],
                new Dictionary<int, HashSet<int>> { [bouts[0].BoutId] = [100, 101], [bouts[1].BoutId] = [100, 103] },
                new Dictionary<int, HashSet<int>> { [bouts[0].BoutId] = [100, 101], [bouts[1].BoutId] = [100, 103] },
                e => e, (_, _) => 2);
            Check("two hours of real rest after the slot ends is accepted", roomy.Count == 0,
                string.Join("; ", roomy.Select(c => c.Kind)));
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 16: never two bouts at once in different rings ===");
        {
            var inA = Bouts(1, 10, "u18", 45, 100);
            var inB = Bouts(1, 20, "u18", 48, 100);   // same athletes, other ring

            var plan = BoutScheduler.Build([.. inA, .. inB], [ringA, ringB],
                new Dictionary<int, int> { [10] = 1, [20] = 2 }, new Dictionary<int, DateTime>(), [day1]);

            var both = plan.Slots.OrderBy(s => s.RingId).Select(s => s.StartTime).Distinct().Count();
            Check("both are at 17:00 in different rings", both == 1);
            Check("the overlap is reported", plan.Clashes.Any(c => c.Kind == "same_time"),
                string.Join("; ", plan.Clashes.Select(c => c.Kind)));
        }

        Console.WriteLine();
        Console.WriteLine("=== bouts spread over the days a division is given ===");
        {
            var first = Bouts(2, 10, "u18", 45, 100);
            var second = Bouts(2, 20, "u18", 48, 200);

            var plan = BoutScheduler.Build([.. first, .. second], [ringA],
                new Dictionary<int, int> { [10] = 1, [20] = 1 },
                new Dictionary<int, DateTime> { [10] = day1, [20] = day2 }, [day1, day2]);

            Check("the first division runs on day one",
                plan.Slots.Where(s => s.BoutId / 100 == 10).All(s => s.Date == day1));
            Check("the second runs on day two",
                plan.Slots.Where(s => s.BoutId / 100 == 20).All(s => s.Date == day2));
            Check("each day starts its ring at 17:00 again",
                plan.Slots.Count(s => s.StartTime == new TimeSpan(17, 0, 0)) == 2);
        }

        Console.WriteLine();
        Console.WriteLine("=== regenerating is stable ===");
        {
            var bouts = Bouts(4, 10, "u18", 45);
            var once = BoutScheduler.Build(bouts, [ringA, ringB],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1, day2]);
            var twice = BoutScheduler.Build(bouts, [ringA, ringB],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1, day2]);

            Check("the same input gives the same schedule",
                once.Slots.Select(s => (s.BoutId, s.Date, s.RingId, s.OrderInRing, s.StartTime, s.BoutNumber))
                    .SequenceEqual(twice.Slots.Select(s => (s.BoutId, s.Date, s.RingId, s.OrderInRing, s.StartTime, s.BoutNumber))));
        }

        Console.WriteLine();
        Console.WriteLine("=== edge cases ===");
        {
            Check("no rings means no schedule",
                BoutScheduler.Build(Bouts(2), [], new Dictionary<int, int>(), new Dictionary<int, DateTime>(), [day1])
                    .Slots.Count == 0);
            Check("no bouts means no schedule",
                BoutScheduler.Build([], [ringA], new Dictionary<int, int>(), new Dictionary<int, DateTime>(), [day1])
                    .Slots.Count == 0);

            // A division with no ring set still lands somewhere rather than vanishing.
            var orphan = BoutScheduler.Build(Bouts(2), [ringA, ringB],
                new Dictionary<int, int>(), new Dictionary<int, DateTime>(), [day1]);
            Check("a division with no ring set falls back to the first", orphan.Slots.Count == 2
                && orphan.Slots.All(s => s.RingId == 1));

            // A date outside the tournament is pulled back onto it.
            var stray = Bouts(1).Select(b => b with { Date = new DateTime(2030, 1, 1) }).ToList();
            var fixedUp = BoutScheduler.Build(stray, [ringA],
                new Dictionary<int, int> { [10] = 1 }, new Dictionary<int, DateTime>(), [day1, day2]);
            Check("a date outside the tournament is corrected", fixedUp.Slots.Single().Date == day1);
        }


        Console.WriteLine();
        Console.WriteLine("=== rule 17 superseded (Stage 5): ring/day timing decides every start time ===");
        {
            var divisionRing = new Dictionary<int, int> { [10] = 1 };
            var own = BoutScheduler.Build(
                Bouts(3), [ringA], divisionRing, new Dictionary<int, DateTime>(), [day1],
                divisionTiming: new Dictionary<int, BoutScheduler.DivisionTiming> { [10] = new(new TimeSpan(19, 30, 0), 7) });
            Check("a division's own start/interval no longer overrides the ring's (approved: per-ring, per-day timing)",
                string.Join(", ", own.Slots.OrderBy(s => s.OrderInRing).Select(s => s.StartTime.ToString(@"hh\:mm"))) == "17:00, 17:15, 17:30",
                string.Join(", ", own.Slots.OrderBy(s => s.OrderInRing).Select(s => s.StartTime.ToString(@"hh\:mm"))));
        }

        failures.AddRange(Stage5ScheduleTests.Run());

        Console.WriteLine();
        Console.WriteLine(failures.Count == 0 ? "FAILED: none" : "FAILED: " + string.Join(", ", failures));
        return failures.Count == 0 ? 0 : 1;
    }
}
