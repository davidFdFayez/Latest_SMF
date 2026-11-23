using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// The SMTF weigh-in policy (2026-11-14), on every official list of every age
/// category and gender:
/// <list type="bullet">
/// <item>first class: limit − 2.00 kg to the limit, both inclusive;</item>
/// <item>every later class: above the preceding official limit (exclusive)
/// up to its own limit (inclusive);</item>
/// <item>open "+" class: above the preceding official limit, no upper limit;</item>
/// <item>weights to at most two decimal places, nothing rounded.</item>
/// </list>
/// The expected values are worked out here from the list itself, not taken
/// from <see cref="WeighInRange"/>, so the test is a second reading of the
/// policy rather than a copy of the code.
/// </summary>
public static class WeighInRangeTests
{
    // Every category the official mapping might hold, Masters included.
    private static readonly string[] Categories =
        ["u8", "u10", "u12", "u14", "u16", "u18", "u24", "elite", "masters_35", "masters_40", "masters_45"];

    private static readonly string[] Genders = ["female", "male"];

    public static int Run()
    {
        var failures = new List<string>();
        var passed = 0;

        // The matrix is thousands of checks: failures are printed, passes counted.
        void Check(string name, bool ok, string detail = "")
        {
            if (ok) { passed++; return; }
            Console.WriteLine("  FAIL " + name + (detail.Length > 0 ? " - " + detail : ""));
            failures.Add(name);
        }

        void Say(string text) => Console.WriteLine("  PASS " + text);

        static WeighInRange Range(string category, string gender, WeightClasses.WeightClass cls) =>
            WeighInRange.For(category, gender, cls.LimitKg, cls.FloorKg);

        static string V(WeighInRange r, decimal kg) => r.Check(kg).Code();

        const decimal step = 0.01m;
        var lists = 0;
        int firsts = 0, bounded = 0, opens = 0, closedLists = 0;

        // ── 1. Every class of every list, at its boundaries ──
        foreach (var category in Categories)
        foreach (var gender in Genders)
        {
            if (!WeightClasses.Knows(category, gender)) continue;
            var list = WeightClasses.For(category, gender);
            lists++;
            var where = $"{category}/{gender}";

            for (var i = 0; i < list.Count; i++)
            {
                var cls = list[i];
                var r = Range(category, gender, cls);
                Check($"{where} {cls.Label(false)} is resolved", r.Resolved, r.Issue ?? "");

                if (i == 0)
                {
                    // First class: limit − 2.00 .. limit, inclusive.
                    firsts++;
                    var max = cls.LimitKg!.Value;
                    var min = max - 2.00m;
                    Check($"{where} first {max} is the first kind", r.Kind == "first", r.Kind);
                    foreach (var (kg, want) in new[]
                             {
                                 (min - step, "below_minimum"), (min, "matches"), (min + step, "matches"),
                                 (max - step, "matches"), (max, "matches"), (max + step, "exceeds_class"),
                             })
                        Check($"{where} first {max} kg at {kg} -> {want}", V(r, kg) == want, V(r, kg));
                    Check($"{where} first {max} shows {min}–{max}", r.MinAcceptedKg == min && r.MaxKg == max,
                        $"{r.MinAcceptedKg}–{r.MaxKg}");
                }
                else if (cls.IsOpen)
                {
                    // Open class: above the preceding limit, no maximum, never "exceeds".
                    opens++;
                    var previous = list[i - 1].LimitKg!.Value;
                    Check($"{where} {cls.Label(false)} sits on the preceding limit", cls.FloorKg == previous);
                    foreach (var (kg, want) in new[]
                             {
                                 (previous - step, "below_minimum"), (previous, "below_minimum"),
                                 (previous + step, "matches"), (previous + 4m, "matches"),
                                 (previous + 19m, "matches"), (299.99m, "matches"),
                             })
                        Check($"{where} {cls.Label(false)} at {kg} -> {want}", V(r, kg) == want, V(r, kg));
                    Check($"{where} {cls.Label(false)} has no maximum", r.MaxKg is null && r.Kind == "open");
                }
                else
                {
                    // Bounded class: above the preceding official limit .. its own limit.
                    bounded++;
                    var previous = list[i - 1].LimitKg!.Value;
                    var max = cls.LimitKg!.Value;
                    foreach (var (kg, want) in new[]
                             {
                                 (previous - step, "below_minimum"), (previous, "below_minimum"),
                                 (previous + step, "matches"), (max - step, "matches"),
                                 (max, "matches"), (max + step, "exceeds_class"),
                             })
                        Check($"{where} {max} kg at {kg} -> {want}", V(r, kg) == want, V(r, kg));
                    Check($"{where} {max} shows {previous + step}–{max}",
                        r.MinAcceptedKg == previous + step && r.MaxKg == max && r.Kind == "bounded",
                        $"{r.MinAcceptedKg}–{r.MaxKg} {r.Kind}");
                }
            }

            // Lists without an open class stop at their heaviest limit: nothing is invented above it.
            if (!list[^1].IsOpen)
            {
                closedLists++;
                var top = list[^1].LimitKg!.Value;
                var anyAbove = list.Any(c => V(Range(category, gender, c), top + step) == "matches");
                Check($"{where} has no class above {top} kg", !anyAbove);
            }

            // ── 2. No gap and no overlap: every weight in 0.01 kg steps from the
            //       first class's minimum up to 5 kg over the last limit lands in
            //       exactly one class (or none, above a closed list). ──
            var start = list[0].LimitKg!.Value - 2.00m;
            var last = list.Where(c => !c.IsOpen).Max(c => c.LimitKg!.Value);
            var ranges = list.Select(c => Range(category, gender, c)).ToList();
            var holes = new List<decimal>();
            var doubles = new List<decimal>();
            for (var kg = start; kg <= last + 5m; kg += step)
            {
                var hits = ranges.Count(r => r.Check(kg) == WeighInVerdict.Matches);
                var expected = kg > last && !list[^1].IsOpen ? 0 : 1;
                if (hits < expected) holes.Add(kg);
                if (hits > expected) doubles.Add(kg);
            }
            Check($"{where} has no gap between classes", holes.Count == 0, string.Join(", ", holes.Take(5)));
            Check($"{where} has no overlap between classes", doubles.Count == 0, string.Join(", ", doubles.Take(5)));
            var below = ranges.Count(r => r.Check(start - step) == WeighInVerdict.Matches);
            Check($"{where} takes nothing under the first class's minimum", below == 0);
        }

        Say($"{lists} official lists: {firsts} first classes, {bounded} bounded classes, {opens} open classes, "
            + $"{closedLists} lists without an open class — every boundary checked");
        Check("all 22 official lists are covered", lists == 22, lists.ToString());

        // ── 3. The brief's worked examples ──
        static WeighInRange Of(string c, string g, decimal? limit) =>
            Range(c, g, WeightClasses.For(c, g).First(x => limit is null ? x.IsOpen : x.LimitKg == limit));

        var u14f34 = Of("u14", "female", 34);
        foreach (var (kg, want) in new[]
                 {
                     (32.00m, "below_minimum"), (32.01m, "matches"), (32.10m, "matches"), (32.25m, "matches"),
                     (33.75m, "matches"), (34.00m, "matches"), (34.01m, "exceeds_class"),
                 })
            Check($"Female U14 34 kg at {kg} -> {want}", V(u14f34, kg) == want, V(u14f34, kg));
        Check("Female U14 36 kg accepts 34.01–36", Of("u14", "female", 36).Text() == "34.01–36 kg", Of("u14", "female", 36).Text());
        Check("Female U14 38 kg accepts 36.01–38", Of("u14", "female", 38).Text() == "36.01–38 kg", Of("u14", "female", 38).Text());
        var u14f32 = Of("u14", "female", 32);
        Check("Female U14 32 kg (first) accepts 30–32", u14f32.Text() == "30–32 kg", u14f32.Text());
        foreach (var (kg, want) in new[] { (29.99m, "below_minimum"), (30m, "matches"), (31m, "matches"), (32m, "matches"), (32.01m, "exceeds_class") })
            Check($"Female U14 32 kg at {kg} -> {want}", V(u14f32, kg) == want, V(u14f32, kg));
        var open91 = Of("elite", "male", null);
        foreach (var (kg, want) in new[] { (91.00m, "below_minimum"), (91.01m, "matches"), (95m, "matches"), (110m, "matches") })
            Check($"Male Elite +91 at {kg} -> {want}", V(open91, kg) == want, V(open91, kg));
        Check("Male Elite +91 reads 'over 91 kg'", open91.Text() == "over 91 kg", open91.Text());
        Say("the brief's examples: Female U14 32/34/36/38 kg and Male Elite +91 kg");

        // ── 4. Lists are separate: the same limit has different boundaries per category/gender ──
        Check("Female U18 45 kg (after 42) differs from Male U18 45 kg (first class)",
            Of("u18", "female", 45).Text() == "42.01–45 kg" && Of("u18", "male", 45).Text() == "43–45 kg",
            $"{Of("u18", "female", 45).Text()} / {Of("u18", "male", 45).Text()}");
        Check("Male U16 first class is 38 (36–38), Female U16 first class is 36 (34–36)",
            Of("u16", "male", 38).Text() == "36–38 kg" && Of("u16", "female", 36).Text() == "34–36 kg");
        Say("each category and gender is judged on its own list");

        // ── 5. A tournament that omits classes does not move a boundary: the
        //       stored floor is the official preceding class, and a floor taken
        //       from the tournament's own selection is refused, not trusted. ──
        var skip = WeighInRange.For("u14", "male", 44, 42);
        Check("U14 male 44 kg keeps the official 42 floor (42.01–44) even if 36 and 42 are not run",
            skip.Text() == "42.01–44 kg", skip.Text());
        var wrongFloor = WeighInRange.For("u14", "male", 44, 36);
        Check("a floor from the tournament's own selection (36) is not configured, never guessed",
            !wrongFloor.Resolved && wrongFloor.Check(40m) == WeighInVerdict.NotConfigured, wrongFloor.Issue ?? "");
        Check("a limit that is not official is not configured",
            !WeighInRange.For("u14", "male", 33, 32).Resolved);
        Check("an unknown category is not configured", !WeighInRange.For("u99", "male", 45, null).Resolved);
        Say("omitted tournament classes and non-official divisions");

        // ── 6. Precision: at most two decimal places, judged on the value, never rounded ──
        foreach (var kg in new[] { 32m, 32.1m, 32.01m, 33.25m, 32.10m, 0.01m, 299.99m })
            Check($"{kg} has a valid precision", WeighInWeights.HasValidPrecision(kg));
        foreach (var kg in new[] { 32.001m, 33.255m, 33.2555m, 34.005m, 0.001m })
            Check($"{kg} has too many decimal places", !WeighInWeights.HasValidPrecision(kg));
        foreach (var (kg, text) in new[] { (32m, "32"), (32.10m, "32.1"), (33.25m, "33.25"), (33.2555m, "33.2555"), (32.495m, "32.495"), (63.5m, "63.5") })
            Check($"{kg} is shown as {text}, never rounded", WeighInWeights.Kg(kg) == text, WeighInWeights.Kg(kg));
        Check("32.005 (an old 3-decimal record) is judged as measured: above 32 for the 34 kg class",
            V(u14f34, 32.005m) == "matches");
        Say("two-decimal precision and exact weight text");

        Console.WriteLine($"  {passed} checks passed, {failures.Count} failed");
        Console.WriteLine();
        Console.WriteLine(failures.Count == 0
            ? "  weigh-in range: all checks passed"
            : "  weigh-in range FAILED: " + string.Join(", ", failures.Take(20)));
        return failures.Count;
    }
}
