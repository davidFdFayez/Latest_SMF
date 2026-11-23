using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// Draw Management, Phase 3 — the generated bracket for every athlete count
/// the rules cover (0–128): the counts, the round names, the BYE pairing
/// order, one placement per athlete, a valid elimination tree, no third-place
/// bout, and club separation where it is possible.
/// </summary>
public static class DrawGenerationTests
{
    public static int Run()
    {
        var failures = new List<string>();
        void Check(string name, bool ok, string detail = "")
        {
            if (ok) return;
            Console.WriteLine("  FAIL " + name + (detail.Length > 0 ? " - " + detail : ""));
            failures.Add(name);
        }

        static List<DrawBuilder.Contender> Field(int n, Func<int, string?> club) =>
            Enumerable.Range(1, n).Select(i => new DrawBuilder.Contender(i, club(i))).ToList();

        // The first full round for each count, as specified: it holds the whole
        // bracket when the field is a power of two, half of it otherwise.
        string FirstFullRound(int n) => (DrawMath.For(n).Byes == 0 ? DrawMath.BracketSize(n) : DrawMath.BracketSize(n) / 2) switch
        {
            2 => "Final", 4 => "Semi-final", 8 => "Quarter-final", 16 => "Round of 16",
            32 => "Round of 32", 64 => "Round of 64", 128 => "Round of 128", _ => "?",
        };

        Check("0 athletes: nothing is drawn", DrawBuilder.Build(Field(0, _ => null), 1).Bouts.Count == 0);
        Check("1 athlete: nothing is drawn", DrawBuilder.Build(Field(1, _ => null), 1).Bouts.Count == 0);

        for (var n = 2; n <= 128; n++)
        {
            foreach (var seed in new[] { 7, 1234, 99991 })
            {
                var label = $"N={n} seed={seed}";
                var field = Field(n, i => i % 5 == 0 ? null : $"Club {(i % 3) + 1}");
                var draw = DrawBuilder.Build(field, seed);
                var plan = DrawMath.For(n);
                var bracket = plan.BracketSize!.Value;
                var byes = plan.Byes!.Value;
                var rounds = (int)Math.Log2(bracket);
                var real = draw.Bouts.Where(b => !b.IsBye).ToList();
                var byeRows = draw.Bouts.Where(b => b.IsBye).ToList();
                var round1 = draw.Bouts.Where(b => b.Round == 1).OrderBy(b => b.Position).ToList();
                var partial = byes > 0;

                Check($"{label} total competitive bouts = N − 1", real.Count == n - 1, $"{real.Count}");
                Check($"{label} BYEs = bracket − N, not counted as bouts", byeRows.Count == byes && draw.ByeCount == byes);
                Check($"{label} preliminary bouts", partial
                    ? round1.Count(b => !b.IsBye) == plan.PreliminaryBouts
                    : round1.All(b => !b.IsBye) && round1.Count == bracket / 2);
                Check($"{label} rounds = log2(bracket)", draw.TotalRounds == rounds);
                Check($"{label} one final, no third-place bout",
                    draw.Bouts.Count(b => b.Round == rounds) == 1 && draw.Bouts.All(b => b.Round <= rounds));

                // Round names.
                var firstFull = partial ? 2 : 1;
                Check($"{label} round 1 is Preliminary only when the field is not a power of two",
                    (BoutRounds.Name(1, rounds, partial).En == "Preliminary") == partial);
                if (firstFull <= rounds)
                {
                    var name = BoutRounds.Name(firstFull, rounds, false).En;
                    Check($"{label} first full round is {FirstFullRound(n)}", name == FirstFullRound(n), name);
                }
                Check($"{label} last round is the Final", BoutRounds.Name(rounds, rounds, rounds == 1 && partial).En == "Final" || (rounds == 1));

                // Every athlete placed exactly once in round one.
                var placed = round1.SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).Where(id => id is not null).Select(id => id!.Value).ToList();
                Check($"{label} each athlete placed once", placed.Count == n && placed.Distinct().Count() == n
                    && placed.ToHashSet().SetEquals(field.Select(c => c.EntryId)));

                // A valid elimination tree: every bout below the final feeds exactly one free slot above.
                var targets = new HashSet<(int, int, string)>();
                var treeOk = true;
                foreach (var b in draw.Bouts)
                {
                    if (b.Round == rounds) { treeOk &= b.WinnerToPosition is null; continue; }
                    if (b.WinnerToPosition is not { } to || b.WinnerToCorner is not ("red" or "blue")) { treeOk = false; continue; }
                    treeOk &= draw.Bouts.Any(x => x.Round == b.Round + 1 && x.Position == to);
                    treeOk &= targets.Add((b.Round + 1, to, b.WinnerToCorner));
                }
                Check($"{label} valid elimination tree", treeOk && targets.Count == draw.Bouts.Count(b => b.Round < rounds));

                // BYE pairing order: byes first in draw order, then the contested bouts.
                if (partial)
                {
                    var orderOk = round1.Take(byes).All(b => b.IsBye) && round1.Skip(byes).All(b => !b.IsBye);
                    Check($"{label} BYEs seated first, contested bouts after", orderOk);
                    var round2 = draw.Bouts.Where(b => b.Round == 2).OrderBy(b => b.Position).ToList();
                    // Even: BYE holders meet each other; odd: the last BYE holder meets the winner of preliminary bout 1.
                    var byeAthletes = round1.Take(byes).Select(b => b.RedEntryId ?? b.BlueEntryId).ToList();
                    for (var k = 0; k + 1 < byes; k += 2)
                    {
                        var bout = round2[k / 2];
                        Check($"{label} BYE holders {k + 1} and {k + 2} meet", bout.RedEntryId == byeAthletes[k] && bout.BlueEntryId == byeAthletes[k + 1]);
                    }
                    if (byes % 2 == 1)
                    {
                        var bout = round2[byes / 2];
                        var firstPrelim = round1[byes];
                        Check($"{label} last BYE holder meets the winner of preliminary 1",
                            bout.RedEntryId == byeAthletes[^1] && bout.BlueEntryId is null
                            && firstPrelim.WinnerToPosition == bout.Position && firstPrelim.WinnerToCorner == "blue");
                    }
                }
            }
        }
        Console.WriteLine("  checked every count from 2 to 128 (3 seeds each): counts, names, BYE order, placements, tree");

        // Worked examples.
        var fourteen = DrawBuilder.Build(Field(14, _ => null), 5);
        var qf = fourteen.Bouts.Where(b => b.Round == 2).OrderBy(b => b.Position).ToList();
        Check("14 athletes: QF1 is BYE holder 1 v BYE holder 2", qf[0].RedEntryId is not null && qf[0].BlueEntryId is not null);
        Check("14 athletes: QF2–QF4 wait for preliminary winners", qf.Skip(1).All(b => b.RedEntryId is null && b.BlueEntryId is null));
        foreach (var (n, expected) in new[] { (70, new[] { 6, 32, 16, 8, 4, 2, 1 }), (76, new[] { 12, 32, 16, 8, 4, 2, 1 }) })
        {
            var draw = DrawBuilder.Build(Field(n, i => $"C{i % 9}"), 11);
            var perRound = Enumerable.Range(1, draw.TotalRounds).Select(r => draw.Bouts.Count(b => b.Round == r && !b.IsBye)).ToArray();
            Check($"{n} athletes: bouts per round {string.Join("/", expected)}", perRound.SequenceEqual(expected), string.Join("/", perRound));
            Check($"{n} athletes: {n - 1} bouts in all", perRound.Sum() == n - 1);
        }

        // Club separation where it is possible: two clubs, evenly split.
        var separated = 0;
        var trials = 0;
        foreach (var n in new[] { 6, 9, 10, 14, 24, 48, 70, 76, 96, 127 })
        {
            foreach (var seed in Enumerable.Range(1, 20))
            {
                var field = Field(n, i => i % 2 == 0 ? "Alpha" : "Beta");
                var draw = DrawBuilder.Build(field, seed);
                var club = field.ToDictionary(c => c.EntryId, c => c.Club);
                var round1 = draw.Bouts.Where(b => b.Round == 1).OrderBy(b => b.Position).ToList();
                var prelimClashes = round1.Count(b => !b.IsBye && club[b.RedEntryId!.Value] == club[b.BlueEntryId!.Value]);
                var byePairClashes = draw.Bouts.Count(b => b.Round == 2 && b.RedEntryId is { } r && b.BlueEntryId is { } l && club[r] == club[l]);
                trials++;
                if (prelimClashes == 0 && byePairClashes == 0) separated++;
                else Check($"two even clubs, N={n} seed={seed}: no same-club first bouts", false, $"prelim {prelimClashes}, bye pairs {byePairClashes}");
            }
        }
        Console.WriteLine($"  club separation (two even clubs): {separated}/{trials} draws with no same-club first bout");

        // The odd last BYE avoids the club of preliminary bout 1 when it can.
        var oddAvoided = 0;
        var oddTrials = 0;
        foreach (var seed in Enumerable.Range(1, 200))
        {
            var field = Field(9, i => i <= 3 ? "Alpha" : $"Other {i}");
            var draw = DrawBuilder.Build(field, seed);
            var club = field.ToDictionary(c => c.EntryId, c => c.Club);
            var round1 = draw.Bouts.Where(b => b.Round == 1).OrderBy(b => b.Position).ToList();
            var prelim = round1.Single(b => !b.IsBye);
            var lastBye = round1.Where(b => b.IsBye).Last();
            var lastClub = club[(lastBye.RedEntryId ?? lastBye.BlueEntryId)!.Value];
            oddTrials++;
            if (lastClub != club[prelim.RedEntryId!.Value] && lastClub != club[prelim.BlueEntryId!.Value]) oddAvoided++;
        }
        Check("odd BYEs: the last BYE holder never shares a club with preliminary bout 1 when avoidable", oddAvoided == oddTrials, $"{oddAvoided}/{oddTrials}");

        // Athletes without a club are not one club.
        var noClubs = DrawBuilder.Build(Field(8, _ => null), 3);
        Check("no-club athletes are drawn normally", noClubs.Bouts.Count(b => !b.IsBye) == 7);

        Console.WriteLine(failures.Count == 0 ? "  PASS all generation checks" : $"  {failures.Count} failures");
        Console.WriteLine("FAILED: " + (failures.Count == 0 ? "none" : string.Join(", ", failures.Take(8))));
        return failures.Count;
    }
}
