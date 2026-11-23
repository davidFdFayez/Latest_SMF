using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// REQ-10 — the single-elimination test matrix the bracket redesign was
/// specified with, run against the engine that writes the stored draw
/// (DrawBuilder) and the round names (BoutRounds). For every athlete count and
/// several seeds: BYE count, actual bout count N − 1, bouts per round, round
/// names, the even/odd BYE pairing of the second round, every athlete exactly
/// once, a complete winner path to the Final, no fake BYE bouts counted, and
/// no winners recorded.
/// </summary>
public static class BracketMatrixTests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            if (!ok)
            {
                Console.WriteLine("  FAIL " + name + (detail.Length > 0 ? " - " + detail : ""));
                failures.Add(name);
            }
        }

        var matrix = new (int N, int Byes, int Bouts)[]
        {
            (2, 0, 1), (3, 1, 2), (4, 0, 3), (5, 3, 4), (6, 2, 5), (7, 1, 6), (8, 0, 7), (9, 7, 8), (10, 6, 9),
            (11, 5, 10), (12, 4, 11), (13, 3, 12), (14, 2, 13), (15, 1, 14), (16, 0, 15), (32, 0, 31),
            (64, 0, 63), (70, 58, 69), (128, 0, 127),
        };
        var seeds = new[] { 1, 7, 42, 2026, 99991 };
        var checkedCases = 0;

        foreach (var (n, byes, totalBouts) in matrix)
        foreach (var seed in seeds)
        {
            var tag = $"{n} athletes, seed {seed}:";
            var field = Enumerable.Range(1, n)
                .Select(i => new DrawBuilder.Contender(i, $"Club {i % 5}"))
                .ToList();
            var draw = DrawBuilder.Build(field, seed);
            var bracket = 1;
            while (bracket < n) bracket <<= 1;
            var rounds = (int)Math.Log2(bracket);
            var rows = draw.Bouts;

            bool IsBye(DrawBuilder.PlannedBout b) => b.Round == 1 && b.IsBye;
            var actual = rows.Where(b => !IsBye(b)).ToList();

            Check($"{tag} {byes} BYEs", draw.ByeCount == byes && rows.Count(IsBye) == byes, $"{draw.ByeCount}");
            Check($"{tag} {totalBouts} actual bouts", actual.Count == totalBouts, $"{actual.Count}");
            Check($"{tag} {rounds} rounds", draw.TotalRounds == rounds, $"{draw.TotalRounds}");
            Check($"{tag} a BYE row is never a later-round bout", rows.Where(b => b.Round > 1).All(b => !b.IsBye));
            Check($"{tag} a BYE row holds one athlete",
                rows.Where(IsBye).All(b => (b.RedEntryId is null) != (b.BlueEntryId is null)));

            // Bouts per round, and their names.
            for (var r = 1; r <= rounds; r++)
            {
                var expected = r == 1 ? (n - byes) / 2 : bracket >> r;
                var got = actual.Count(b => b.Round == r);
                Check($"{tag} round {r} has {expected} bouts", got == expected, $"{got}");
                var name = BoutRounds.Name(r, rounds, r == 1 && byes > 0).En;
                var want = r == 1 && byes > 0 ? "Preliminary"
                    : (rounds - r) switch
                    {
                        0 => "Final", 1 => "Semi-final", 2 => "Quarter-final",
                        var k => $"Round of {1 << (k + 1)}",
                    };
                Check($"{tag} round {r} is named {want}", name == want, name);
            }
            Check($"{tag} Preliminary exists only with BYEs",
                (byes > 0) == draw.HasPreliminaryRound && (byes > 0) == (BoutRounds.Name(1, rounds, byes > 0).En == "Preliminary"));

            // Every athlete exactly once in round one.
            var placed = rows.Where(b => b.Round == 1)
                .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).OfType<int>().ToList();
            Check($"{tag} every athlete once in round one",
                placed.Count == n && placed.Distinct().Count() == n && placed.All(id => id >= 1 && id <= n));

            // The graph: each row below the Final feeds one corner of the next round; each corner is fed once.
            var byPosition = rows.ToDictionary(b => (b.Round, b.Position));
            var fed = new Dictionary<(int, int, string), int>();
            var graphOk = true;
            foreach (var b in rows)
            {
                if (b.Round == rounds)
                {
                    graphOk &= b.WinnerToPosition is null;
                    continue;
                }
                if (b.WinnerToPosition is not { } to || b.WinnerToCorner is not ("red" or "blue")
                    || !byPosition.ContainsKey((b.Round + 1, to)))
                {
                    graphOk = false;
                    continue;
                }
                var key = (b.Round + 1, to, b.WinnerToCorner);
                fed[key] = fed.GetValueOrDefault(key) + 1;
            }
            graphOk &= rows.Where(b => b.Round > 1).All(b =>
                fed.GetValueOrDefault((b.Round, b.Position, "red")) == 1
                && fed.GetValueOrDefault((b.Round, b.Position, "blue")) == 1);
            graphOk &= rows.Count(b => b.Round == rounds) == 1;
            Check($"{tag} complete winner path to a single Final", graphOk);

            // BYE holders are seated in the bout they feed; nobody else is seated beyond round one.
            var seatedLater = rows.Where(b => b.Round > 1)
                .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId }).OfType<int>().ToList();
            var byeHolders = rows.Where(IsBye).OrderBy(b => b.Position).Select(b => (b.RedEntryId ?? b.BlueEntryId)!.Value).ToList();
            Check($"{tag} only BYE holders are seated beyond round one, once each",
                seatedLater.Count == byes && seatedLater.OrderBy(x => x).SequenceEqual(byeHolders.OrderBy(x => x))
                && (rounds < 2 || rows.Where(b => b.Round > 2).All(b => b.RedEntryId is null && b.BlueEntryId is null)));

            // Round two pairing: BYE holders first in draw order; odd → last holder v W(prelim 1); then winners in order.
            if (byes > 0 && rounds >= 2)
            {
                var prelims = rows.Where(b => b.Round == 1 && !b.IsBye).OrderBy(b => b.Position).ToList();
                string Source(int position, string corner)
                {
                    var feeder = rows.Single(b => b.Round == 1 && b.WinnerToPosition == position && b.WinnerToCorner == corner);
                    return feeder.IsBye
                        ? $"A{feeder.RedEntryId ?? feeder.BlueEntryId}"
                        : $"W{prelims.IndexOf(feeder) + 1}";
                }
                var got = rows.Where(b => b.Round == 2).OrderBy(b => b.Position)
                    .Select(b => $"{Source(b.Position, "red")}v{Source(b.Position, "blue")}").ToList();
                var want = new List<string>();
                for (var i = 0; i + 1 < byeHolders.Count; i += 2) want.Add($"A{byeHolders[i]}vA{byeHolders[i + 1]}");
                var w = 1;
                if (byeHolders.Count % 2 == 1) want.Add($"A{byeHolders[^1]}vW{w++}");
                for (; w + 1 <= prelims.Count; w += 2) want.Add($"W{w}vW{w + 1}");
                Check($"{tag} round-2 pairing follows the {(byes % 2 == 0 ? "even" : "odd")} BYE rule",
                    got.SequenceEqual(want), $"{string.Join(",", got)} / {string.Join(",", want)}");

                // A BYE holder's opponent is already known (another holder) or the winner of a preliminary.
                var seatedPairs = rows.Where(b => b.Round == 2).Count(b => b.RedEntryId is not null && b.BlueEntryId is not null);
                Check($"{tag} {byes / 2} second-round bouts are BYE holder v BYE holder", seatedPairs == byes / 2, $"{seatedPairs}");
            }
            checkedCases++;
        }

        // The 11-athlete visual acceptance case, written out.
        {
            var draw = DrawBuilder.Build(Enumerable.Range(1, 11).Select(i => new DrawBuilder.Contender(i, null)).ToList(), 5);
            var rows = draw.Bouts;
            var byes = rows.Where(b => b.Round == 1 && b.IsBye).OrderBy(b => b.Position).Select(b => b.RedEntryId).ToList();
            var prelim = rows.Where(b => b.Round == 1 && !b.IsBye).OrderBy(b => b.Position).ToList();
            var qf = rows.Where(b => b.Round == 2).OrderBy(b => b.Position).ToList();
            Check("11 athletes: 5 BYEs, 3 preliminary bouts, 4 QF, 2 SF, 1 Final",
                byes.Count == 5 && prelim.Count == 3 && qf.Count == 4
                && rows.Count(b => b.Round == 3) == 2 && rows.Count(b => b.Round == 4) == 1);
            Check("11 athletes: QF 1 = BYE 1 v BYE 2, QF 2 = BYE 3 v BYE 4",
                qf[0].RedEntryId == byes[0] && qf[0].BlueEntryId == byes[1]
                && qf[1].RedEntryId == byes[2] && qf[1].BlueEntryId == byes[3]);
            Check("11 athletes: QF 3 = BYE 5 v winner of preliminary 1",
                qf[2].RedEntryId == byes[4] && qf[2].BlueEntryId is null
                && prelim[0].WinnerToPosition == 3 && prelim[0].WinnerToCorner == "blue");
            Check("11 athletes: QF 4 = winner of preliminary 2 v winner of preliminary 3",
                prelim[1].WinnerToPosition == 4 && prelim[1].WinnerToCorner == "red"
                && prelim[2].WinnerToPosition == 4 && prelim[2].WinnerToCorner == "blue");
            Check("11 athletes: 10 actual bouts", rows.Count(b => !(b.Round == 1 && b.IsBye)) == 10);
        }

        Check("0 athletes: no bracket", DrawBuilder.Build([], 1).Bouts.Count == 0);
        Check("1 athlete: no bout (No Contest), no champion",
            DrawBuilder.Build([new DrawBuilder.Contender(1, null)], 1).Bouts.Count == 0);

        Console.WriteLine(failures.Count == 0
            ? $"  bracket matrix: {checkedCases} cases (19 counts × 5 seeds), 0 and 1, and the 11-athlete case — all passed"
            : $"  bracket matrix: {failures.Count} FAILED");
        return failures.Count;
    }
}
