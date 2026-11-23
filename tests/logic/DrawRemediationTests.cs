using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// Draw-engine remediation (DRW-001, and the DrawIntegrity rules behind
/// DRW-003/004/005): club separation is optimal wherever it is possible, the
/// bracket shape and BYE routing are unchanged, a seed still reproduces its
/// draw, and every broken invariant the defects produced is detected.
/// </summary>
public static class DrawRemediationTests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        static int ByesFor(int n)
        {
            var bracket = 1;
            while (bracket < n) bracket <<= 1;
            return bracket - n;
        }

        static List<DrawBuilder.Contender> Clubs(params int[] sizes)
        {
            var list = new List<DrawBuilder.Contender>();
            var id = 1;
            for (var c = 0; c < sizes.Length; c++)
                for (var i = 0; i < sizes[c]; i++)
                    list.Add(new DrawBuilder.Contender(id++, $"Club {(char)('A' + c)}"));
            return list;
        }

        static bool Single(int n) => ByesFor(n) % 2 == 1 && n >= 3;

        // Brute force: the fewest same-club first meetings over every arrangement.
        static int Optimum(List<DrawBuilder.Contender> pool)
        {
            var single = Single(pool.Count);
            var best = int.MaxValue;
            var a = pool.ToArray();
            var c = new int[a.Length];
            best = Math.Min(best, DrawBuilder.Clashes(a, single));
            var i = 0;
            while (i < a.Length)
            {
                if (c[i] < i)
                {
                    if (i % 2 == 0) (a[0], a[i]) = (a[i], a[0]); else (a[c[i]], a[i]) = (a[i], a[c[i]]);
                    best = Math.Min(best, DrawBuilder.Clashes(a, single));
                    if (best == 0) return 0;
                    c[i]++;
                    i = 0;
                }
                else
                {
                    c[i] = 0;
                    i++;
                }
            }
            return best;
        }

        // First meetings in a BUILT draw, read from its bouts (independent of Arrange).
        static int BuiltClashes(DrawBuilder.Draw draw, IReadOnlyDictionary<int, string?> club)
        {
            bool Same(int? x, int? y) => x is { } a && y is { } b && club[a] is { } ca && club[b] is { } cb
                                         && string.Equals(ca, cb, StringComparison.OrdinalIgnoreCase);
            var round1 = draw.Bouts.Where(b => b.Round == 1).OrderBy(b => b.Position).ToList();
            var clashes = round1.Count(b => !b.IsBye && Same(b.RedEntryId, b.BlueEntryId));
            // BYE holders meet in round two: pairs of BYEs, and the odd BYE against the first bout.
            for (var p = 0; p + 1 < round1.Count; p += 2)
            {
                var x = round1[p];
                var y = round1[p + 1];
                if (x.IsBye && y.IsBye && Same(x.RedEntryId, y.RedEntryId)) clashes++;
                if (x.IsBye && !y.IsBye)
                {
                    if (Same(x.RedEntryId, y.RedEntryId)) clashes++;
                    if (Same(x.RedEntryId, y.BlueEntryId)) clashes++;
                }
            }
            return clashes;
        }

        static List<DrawIntegrity.Row> Rows(DrawBuilder.Draw draw)
        {
            var ordered = draw.Bouts.OrderBy(b => b.Round).ThenBy(b => b.Position).ToList();
            var id = ordered.Select((b, i) => (b, i)).ToDictionary(x => (x.b.Round, x.b.Position), x => x.i + 1);
            return ordered.Select(b => new DrawIntegrity.Row(
                id[(b.Round, b.Position)], b.Round, b.Position, b.RedEntryId, b.BlueEntryId, b.IsBye, false, null,
                b.WinnerToPosition is { } next ? id[(b.Round + 1, next)] : null, b.WinnerToCorner)).ToList();
        }

        Console.WriteLine("=== DRW-001: separation equals the brute-force optimum (n = 2..8, 160 club mixes, 30 seeds) ===");
        var random = new Random(20261115);
        var worse = 0;
        var mixes = 0;
        for (var mix = 0; mix < 160; mix++)
        {
            var n = 2 + random.Next(7);
            var clubCount = 1 + random.Next(4);
            var pool = Enumerable.Range(1, n).Select(i => new DrawBuilder.Contender(i, $"C{random.Next(clubCount)}")).ToList();
            var optimum = Optimum(pool);
            mixes++;
            for (var seed = 0; seed < 30; seed++)
            {
                var got = DrawBuilder.Clashes(DrawBuilder.Arrange(pool, ByesFor(n), seed), Single(n));
                if (got != optimum) worse++;
            }
        }
        Check($"every arrangement reaches the optimum ({mixes} mixes x 30 seeds)", worse == 0, $"{worse} above the optimum");

        Console.WriteLine("=== DRW-001: the test-matrix distributions, 1,000 seeds each ===");
        var t15Sizes = new[] { 14, 12, 10, 9, 8, 7, 6, 5, 3, 3 }; // 77 athletes, 10 uneven clubs
        foreach (var (label, pool, bound) in new[]
                 {
                     ("T01 3 clubs x 2 (6 athletes, 2 BYEs)", Clubs(2, 2, 2), 0),
                     ("T05 3 clubs x 4 (12 athletes, 4 BYEs)", Clubs(4, 4, 4), 0),
                     ("T15 77 athletes in 10 uneven clubs (51 BYEs)", Clubs(t15Sizes), 0),
                     ("2 clubs x 3 (6 athletes)", Clubs(3, 3), 0),
                     ("5 athletes, 3 BYEs (odd), clubs 2-2-1", Clubs(2, 2, 1), 0),
                     ("9 athletes, 7 BYEs (odd), clubs 3-3-3", Clubs(3, 3, 3), 0),
                     ("one club dominates: 10 of 16", Clubs(10, 2, 2, 2), 2),
                     ("one club dominates: 9 of 12", Clubs(9, 3), 3),
                     ("all one club: 8", Clubs(8), 4),
                 })
        {
            var club = pool.ToDictionary(c => c.EntryId, c => c.Club);
            var counts = new List<int>();
            for (var seed = 0; seed < 1000; seed++)
                counts.Add(BuiltClashes(DrawBuilder.Build(pool, seed), club));
            Check($"{label}: same-club first meetings = {bound} (the minimum) in all 1,000 draws",
                counts.All(c => c == bound), $"max {counts.Max()}, min {counts.Min()}");
        }
        foreach (var n in new[] { 7, 13, 25, 50, 77, 100, 127, 128 })
        {
            var pool = Enumerable.Range(1, n).Select(i => new DrawBuilder.Contender(i, $"Club {i % 6}")).ToList();
            var club = pool.ToDictionary(c => c.EntryId, c => c.Club);
            var worst = Enumerable.Range(0, 200).Max(seed => BuiltClashes(DrawBuilder.Build(pool, seed), club));
            Check($"{n} athletes in 6 clubs: no same-club first meeting over 200 seeds", worst == 0, $"worst {worst}");
        }

        Console.WriteLine("=== DRW-001: shape, BYE routing and reproducibility unchanged ===");
        var shapeProblems = new List<string>();
        for (var n = 2; n <= 128; n++)
        {
            var pool = Enumerable.Range(1, n).Select(i => new DrawBuilder.Contender(i, $"Club {i % 3}")).ToList();
            foreach (var seed in new[] { 1, 7, 42, 2026, 99991 })
            {
                var draw = DrawBuilder.Build(pool, seed);
                var problems = DrawIntegrity.Check(Rows(draw), pool.Select(c => c.EntryId).ToList());
                if (problems.Count > 0) shapeProblems.Add($"n={n} seed={seed}: {problems[0]}");
                if (draw.ByeCount != ByesFor(n)) shapeProblems.Add($"n={n}: {draw.ByeCount} byes");
                if (draw.Bouts.Count(b => !b.IsBye && b.Round == 1) != (n - draw.ByeCount) / 2) shapeProblems.Add($"n={n}: round-1 bouts");
            }
        }
        Check("n = 2..128 x 5 seeds: every built draw passes DrawIntegrity with the right BYE count", shapeProblems.Count == 0,
            string.Join(" | ", shapeProblems.Take(3)));
        var reproducible = Enumerable.Range(2, 60).All(n =>
        {
            var pool = Clubs(n / 3 + n % 3, n / 3, n / 3).Take(n).ToList();
            var a = DrawBuilder.Build(pool, 4242).Bouts.Select(b => (b.Round, b.Position, b.RedEntryId, b.BlueEntryId)).ToList();
            var b2 = DrawBuilder.Build(pool, 4242).Bouts.Select(b => (b.Round, b.Position, b.RedEntryId, b.BlueEntryId)).ToList();
            return a.SequenceEqual(b2);
        });
        Check("the same seed reproduces the same draw", reproducible);
        var distinct = Enumerable.Range(0, 50).Select(seed => string.Join(",", DrawBuilder.Build(Clubs(4, 4, 4), seed).Bouts
            .Where(b => b.Round == 1).Select(b => $"{b.RedEntryId}-{b.BlueEntryId}"))).Distinct().Count();
        Check("different seeds still give different draws", distinct >= 40, $"{distinct} distinct of 50");
        Check("the algorithm is versioned for the audit line", DrawBuilder.AlgorithmVersion == "v2");

        Console.WriteLine("=== DrawIntegrity: the broken states the defects produced are detected ===");
        var eight = Enumerable.Range(1, 8).Select(i => new DrawBuilder.Contender(i, $"Club {i}")).ToList();
        var good = Rows(DrawBuilder.Build(eight, 3));
        var ids = eight.Select(c => c.EntryId).ToList();
        Check("an untouched 8-athlete draw is sound", DrawIntegrity.Check(good, ids).Count == 0);

        List<DrawIntegrity.Row> With(List<DrawIntegrity.Row> rows, int index, Func<DrawIntegrity.Row, DrawIntegrity.Row> change)
        {
            var copy = rows.ToList();
            copy[index] = change(copy[index]);
            return copy;
        }

        // DRW-004 (P05): athlete from bout 1 put into bout 2's blue corner, the athlete there dropped.
        var dup = With(good, 1, r => r with { Blue = good[0].Red });
        var dupProblems = DrawIntegrity.Check(dup, ids);
        Check("DRW-004: a duplicated athlete is detected", dupProblems.Any(p => p.Contains("twice")), string.Join("; ", dupProblems));
        Check("DRW-004: the dropped athlete is detected", dupProblems.Any(p => p.Contains("missing")));

        // DRW-003 (P04): a corner emptied and the bout turned into a BYE, opponent not advanced.
        var removed = With(good, 2, r => r with { Red = null, IsBye = true });
        var removedProblems = DrawIntegrity.Check(removed, ids.Where(i => i != good[2].Red).ToList());
        Check("DRW-003: a BYE created by emptying a corner is detected", removedProblems.Count > 0, string.Join("; ", removedProblems));

        // A walkover whose winner was not advanced.
        var walkover = With(good, 0, r => r with { Red = null, IsBye = true, IsWalkover = true, Winner = r.Blue });
        Check("a walkover that does not advance its winner is detected",
            DrawIntegrity.Check(walkover, departed: [good[0].Red!.Value]).Any(p => p.Contains("advances")));

        // The same walkover, advanced: sound.
        var final = good.First(r => r.Round == 2 && r.Position == 1);
        var advanced = With(walkover, good.IndexOf(final), r => r with { Red = good[0].Blue });
        Check("a walkover that advances its winner is sound",
            DrawIntegrity.Check(advanced, departed: [good[0].Red!.Value]).Count == 0,
            string.Join("; ", DrawIntegrity.Check(advanced, departed: [good[0].Red!.Value])));

        // Hand-placing an athlete in a later round.
        var placed = With(good, good.FindIndex(r => r.Round == 3), r => r with { Red = 1 });
        Check("an athlete placed by hand in the Final is detected", DrawIntegrity.Check(placed, ids).Any(p => p.Contains("advances")));

        // A third-place bout, or a second Final.
        var extra = good.Append(new DrawIntegrity.Row(99, 3, 2, null, null, false, false, null, null, null)).ToList();
        Check("a third-place bout is detected", DrawIntegrity.Check(extra, ids).Count > 0);

        // BYEs not seated first (6 athletes).
        var six = Rows(DrawBuilder.Build(eight.Take(6).ToList(), 5));
        var byeIndex = six.FindIndex(r => r.Round == 1 && r.IsBye);
        var fightIndex = six.FindIndex(r => r.Round == 1 && !r.IsBye);
        var moved = six.ToList();
        (moved[byeIndex], moved[fightIndex]) = (moved[byeIndex] with { Position = moved[fightIndex].Position },
            moved[fightIndex] with { Position = moved[byeIndex].Position });
        Check("BYEs not seated first are detected", DrawIntegrity.Check(moved).Any(p => p.Contains("seated first") || p.Contains("linked")));

        // A BYE holder who was not advanced.
        var byeRow = six.First(r => r.Round == 1 && r.IsBye);
        var target = six.First(r => r.Id == byeRow.WinnerToBoutId);
        var unadvanced = With(six, six.IndexOf(target), r => byeRow.WinnerToCorner == "red" ? r with { Red = null } : r with { Blue = null });
        Check("a BYE holder who was not advanced is detected", DrawIntegrity.Check(unadvanced).Any(p => p.Contains("advances")));

        return failures.Count;
    }
}
