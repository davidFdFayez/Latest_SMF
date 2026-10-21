using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>The draw, against the rules REQ-10 states.</summary>
public static class DrawTests
{
    public static int Run()
    {
        // Checks the draw against the rules REQ-10 states.

        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        static List<DrawBuilder.Contender> Pool(int n, string? club = null) =>
            Enumerable.Range(1, n).Select(i => new DrawBuilder.Contender(i, club ?? $"club{i}")).ToList();

        Console.WriteLine("=== bracket size and bye count (rule 2) ===");
        foreach (var (n, bracket, byes) in new[]
                 {
                     (2, 2, 0), (3, 4, 1), (4, 4, 0), (5, 8, 3), (6, 8, 2), (7, 8, 1),
                     (8, 8, 0), (9, 16, 7), (12, 16, 4), (16, 16, 0), (17, 32, 15), (31, 32, 1), (64, 64, 0),
                 })
        {
            var draw = DrawBuilder.Build(Pool(n), seed: 42);
            var rounds = (int)Math.Log2(bracket);
            Check($"{n,2} athletes -> bracket {bracket}, {byes} bye(s), {rounds} round(s)",
                draw.ByeCount == byes && draw.TotalRounds == rounds,
                $"got byes={draw.ByeCount} rounds={draw.TotalRounds}");
        }

        Console.WriteLine();
        Console.WriteLine("=== every athlete is drawn exactly once ===");
        foreach (var n in new[] { 2, 3, 5, 6, 7, 9, 11, 13, 17, 23, 32, 45 })
        {
            var draw = DrawBuilder.Build(Pool(n), seed: 7);
            var first = draw.Bouts.Where(b => b.Round == 1).ToList();
            var seen = first.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
                            .Where(id => id is not null).Select(id => id!.Value).ToList();
            Check($"{n,2} athletes each drawn once", seen.Count == n && seen.Distinct().Count() == n,
                $"saw {seen.Count}, distinct {seen.Distinct().Count()}");
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 4: nobody fights twice before everybody has fought once ===");
        foreach (var n in new[] { 3, 5, 6, 7, 9, 12, 20, 33 })
        {
            var draw = DrawBuilder.Build(Pool(n), seed: 11);
            var contested = draw.Bouts.Where(b => b.Round == 1 && !b.IsBye).ToList();
            var fought = contested.SelectMany(b => new[] { b.RedEntryId!.Value, b.BlueEntryId!.Value }).ToList();
            Check($"{n,2} athletes: no repeat in round one", fought.Distinct().Count() == fought.Count,
                $"{fought.Count} slots, {fought.Distinct().Count()} distinct");
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 2: the round after the first is a clean power of two ===");
        foreach (var n in new[] { 3, 5, 6, 7, 9, 11, 13, 17, 23, 45 })
        {
            var draw = DrawBuilder.Build(Pool(n), seed: 3);
            if (draw.TotalRounds < 2) continue;
            var second = draw.Bouts.Count(b => b.Round == 2);
            var isPowerOfTwo = second > 0 && (second & (second - 1)) == 0;
            Check($"{n,2} athletes: round two holds {second} bout(s)", isPowerOfTwo);
        }

        Console.WriteLine();
        Console.WriteLine("=== byes advance without fighting ===");
        foreach (var n in new[] { 3, 5, 6, 7, 9, 12, 20 })
        {
            var draw = DrawBuilder.Build(Pool(n), seed: 5);
            var byes = draw.Bouts.Where(b => b.Round == 1 && b.IsBye).ToList();
            var placed = draw.Bouts.Where(b => b.Round == 2)
                .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
                .Where(id => id is not null).Select(id => id!.Value).ToHashSet();
            var advanced = byes.All(b => placed.Contains((b.RedEntryId ?? b.BlueEntryId)!.Value));
            Check($"{n,2} athletes: all {byes.Count} bye(s) are in round two", advanced);
        }

        Console.WriteLine();
        Console.WriteLine("=== the bracket is a complete, connected tree ===");
        foreach (var n in new[] { 2, 3, 6, 9, 17, 33 })
        {
            var draw = DrawBuilder.Build(Pool(n), seed: 9);
            var finals = draw.Bouts.Count(b => b.Round == draw.TotalRounds);
            var orphans = draw.Bouts.Count(b => b.Round < draw.TotalRounds && b.WinnerToPosition is null);
            Check($"{n,2} athletes: one final, no orphan bouts", finals == 1 && orphans == 0,
                $"finals={finals} orphans={orphans}");
        }

        Console.WriteLine();
        Console.WriteLine("=== rule 5: no third-place bout, and the round names ===");
        {
            var draw = DrawBuilder.Build(Pool(8), seed: 1);
            var semis = draw.Bouts.Count(b => b.Round == draw.TotalRounds - 1);
            var finals = draw.Bouts.Count(b => b.Round == draw.TotalRounds);
            Check("two semi-finals feed one final and nothing else", semis == 2 && finals == 1,
                $"semis={semis} finals={finals}");

            var sixteen = DrawBuilder.Build(Pool(16), seed: 1);
            var names = Enumerable.Range(1, sixteen.TotalRounds)
                .Select(r => BoutRounds.Name(r, sixteen.TotalRounds, false).En).ToList();
            Check("16 athletes name their rounds correctly",
                string.Join(" / ", names) == "Round of 16 / Quarter-final / Semi-final / Final",
                string.Join(" / ", names));

            var six = DrawBuilder.Build(Pool(6), seed: 1);
            Check("a first round left partly empty by byes is a Preliminary",
                BoutRounds.Name(1, six.TotalRounds, six.HasPreliminaryRound).En == "Preliminary");

            var eight = DrawBuilder.Build(Pool(8), seed: 1);
            Check("a full first round is not",
                BoutRounds.Name(1, eight.TotalRounds, eight.HasPreliminaryRound).En == "Quarter-final");
        }

        Console.WriteLine();
        Console.WriteLine("=== rules 1 and 4: athletes from one club are kept apart ===");
        {
            var mixed = new List<DrawBuilder.Contender>();
            for (var i = 1; i <= 4; i++) mixed.Add(new DrawBuilder.Contender(i, "Riyadh"));
            for (var i = 5; i <= 8; i++) mixed.Add(new DrawBuilder.Contender(i, "Jeddah"));

            var clashes = 0;
            for (var seed = 0; seed < 200; seed++)
            {
                var draw = DrawBuilder.Build(mixed, seed);
                foreach (var bout in draw.Bouts.Where(b => b.Round == 1 && !b.IsBye))
                {
                    var red = mixed.First(c => c.EntryId == bout.RedEntryId).Club;
                    var blue = mixed.First(c => c.EntryId == bout.BlueEntryId).Club;
                    if (red == blue) clashes++;
                }
            }
            Check("two clubs of four never meet in round one across 200 draws", clashes == 0, $"{clashes} clashes");

            var lopsided = new List<DrawBuilder.Contender>();
            for (var i = 1; i <= 6; i++) lopsided.Add(new DrawBuilder.Contender(i, "Riyadh"));
            lopsided.Add(new DrawBuilder.Contender(7, "Jeddah"));
            lopsided.Add(new DrawBuilder.Contender(8, "Dammam"));
            var crowded = DrawBuilder.Build(lopsided, 1);
            Check("a division one club dominates still draws", crowded.Bouts.Count > 0 && crowded.TotalRounds == 3);
        }

        Console.WriteLine();
        Console.WriteLine("=== a draw can be reproduced in a dispute ===");
        {
            var a = DrawBuilder.Build(Pool(12), seed: 99);
            var b = DrawBuilder.Build(Pool(12), seed: 99);
            Check("the same seed gives the same draw",
                a.Bouts.Select(x => (x.Round, x.Position, x.RedEntryId, x.BlueEntryId))
                    .SequenceEqual(b.Bouts.Select(x => (x.Round, x.Position, x.RedEntryId, x.BlueEntryId))));

            var c = DrawBuilder.Build(Pool(12), seed: 100);
            Check("a different seed gives a different draw",
                !a.Bouts.Select(x => (x.RedEntryId, x.BlueEntryId))
                    .SequenceEqual(c.Bouts.Select(x => (x.RedEntryId, x.BlueEntryId))));
        }

        Console.WriteLine();
        Console.WriteLine("=== edge cases ===");
        {
            Check("nobody draws nothing", DrawBuilder.Build([], 1).Bouts.Count == 0);
            Check("one athlete draws nothing", DrawBuilder.Build(Pool(1), 1).Bouts.Count == 0);
            var two = DrawBuilder.Build(Pool(2), 1);
            Check("two athletes are a single final",
                two.Bouts.Count == 1 && two.TotalRounds == 1 && two.ByeCount == 0);
        }

        Console.WriteLine();
        Console.WriteLine(failures.Count == 0 ? "FAILED: none" : "FAILED: " + string.Join(", ", failures));
        return failures.Count == 0 ? 0 : 1;
    }
}
