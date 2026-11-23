using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// Draw Management, Phase 2 — the BYE arithmetic for every athlete count the
/// competition rules cover (0 to 128), against the authoritative reference
/// table, the worked examples and the bracket invariants.
/// </summary>
public static class DrawMathTests
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

        // The reference table, written out band by band exactly as specified:
        // within a band (2^(k-1), 2^k], BYEs fall from 2^k − (2^(k-1)+1) to 0.
        var reference = new Dictionary<int, int>
        {
            [2] = 0, [3] = 1, [4] = 0, [5] = 3, [6] = 2, [7] = 1, [8] = 0,
            [9] = 7, [10] = 6, [11] = 5, [12] = 4, [13] = 3, [14] = 2, [15] = 1, [16] = 0,
        };
        foreach (var (low, high) in new[] { (17, 32), (33, 64), (65, 128) })
            for (var n = low; n <= high; n++) reference[n] = high - n;

        // 0 and 1: no bracket, no BYE figure.
        var zero = DrawMath.For(0);
        Check("0 → No Eligible Athletes, no BYEs", zero.Kind == DrawMath.Kind.NoEligibleAthletes && zero.Byes is null && !zero.CanDraw);
        var one = DrawMath.For(1);
        Check("1 → No Contest, no BYEs", one.Kind == DrawMath.Kind.NoContest && one.Byes is null && !one.CanDraw);

        var checkedCases = 2;
        for (var n = 2; n <= 128; n++)
        {
            var plan = DrawMath.For(n);
            var size = plan.BracketSize ?? 0;
            var byes = plan.Byes ?? -1;
            var prelim = plan.PreliminaryBouts ?? -1;
            var label = $"N={n}";
            Check($"{label} matches the reference table", byes == reference[n], $"got {byes}, expected {reference[n]}");
            Check($"{label} is a bracket that can be drawn", plan.Kind == DrawMath.Kind.Bracket && plan.CanDraw);
            Check($"{label} bracket ≥ N", size >= n, $"{size}");
            Check($"{label} bracket is a power of two", size > 0 && (size & (size - 1)) == 0, $"{size}");
            Check($"{label} is the smallest such power", size / 2 < n, $"{size}");
            Check($"{label} BYEs = bracket − N", byes == size - n);
            Check($"{label} BYEs ≥ 0", byes >= 0);
            Check($"{label} BYEs < N", byes < n);
            Check($"{label} preliminary bouts = (N − BYEs) / 2", prelim == (n - byes) / 2 && (n - byes) % 2 == 0);
            Check($"{label} BYEs + preliminary bouts = bracket / 2", byes + prelim == size / 2);
            Check($"{label} next round = bracket / 2", plan.NextRoundAthletes == size / 2);
            Check($"{label} total bouts = N − 1", plan.TotalBouts == n - 1);
            checkedCases++;
        }
        Console.WriteLine($"  checked {checkedCases} athlete counts (0–128) against the reference table and the invariants");

        foreach (var power in new[] { 2, 4, 8, 16, 32, 64, 128 })
            Check($"{power} athletes → 0 BYEs", DrawMath.For(power).Byes == 0);

        // The worked examples: athletes → (bracket, BYEs, preliminary bouts, next round, total bouts).
        var examples = new (int N, int Size, int Byes, int Prelim, int Next, int Total)[]
        {
            (3, 4, 1, 1, 2, 2), (5, 8, 3, 1, 4, 4), (6, 8, 2, 2, 4, 5), (8, 8, 0, 4, 4, 7),
            (9, 16, 7, 1, 8, 8), (10, 16, 6, 2, 8, 9), (16, 16, 0, 8, 8, 15), (17, 32, 15, 1, 16, 16),
            (32, 32, 0, 16, 16, 31), (33, 64, 31, 1, 32, 32), (64, 64, 0, 32, 32, 63), (65, 128, 63, 1, 64, 64),
            (128, 128, 0, 64, 64, 127),
        };
        foreach (var e in examples)
        {
            var p = DrawMath.For(e.N);
            Check($"example N={e.N}",
                p.BracketSize == e.Size && p.Byes == e.Byes && p.PreliminaryBouts == e.Prelim
                && p.NextRoundAthletes == e.Next && p.TotalBouts == e.Total,
                $"{p.BracketSize}/{p.Byes}/{p.PreliminaryBouts}/{p.NextRoundAthletes}/{p.TotalBouts}");
        }
        Console.WriteLine($"  checked {examples.Length} worked examples");

        // Odd counts are not "one BYE".
        foreach (var (n, byes) in new[] { (9, 7), (17, 15), (33, 31), (65, 63) })
            Check($"{n} athletes → {byes} BYEs, not 1", DrawMath.For(n).Byes == byes);

        // Beyond the supported range: no 256 bracket, no draw.
        var over = DrawMath.For(129);
        Check("129 athletes is over capacity, no bracket and no draw",
            over.Kind == DrawMath.Kind.OverCapacity && over.BracketSize is null && !over.CanDraw);

        Console.WriteLine(failures.Count == 0 ? "  PASS all draw arithmetic checks" : $"  {failures.Count} failures");
        Console.WriteLine("FAILED: " + (failures.Count == 0 ? "none" : string.Join(", ", failures.Take(10))));
        return failures.Count;
    }
}
