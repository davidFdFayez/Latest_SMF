using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Tests;

/// <summary>
/// REG-11 — the athlete's current (body) weight on the membership record.
/// A plausibility check by age band, not a weigh-in: it must take every weight
/// an official class could take at the weigh-in, and refuse what is not a weight.
/// </summary>
public static class MemberWeightTests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        var year = DateTime.UtcNow.Year;
        string Born(int age) => $"{year - age}-05-10";
        bool Accepts(int age, string value) => RegistrationValidator.CurrentWeightProblem(Born(age), value) is null;

        // ── the bands ──
        Check("aged 6–13: 12–80 kg", RegistrationValidator.CurrentWeightRange(7) == (12m, 80m) && RegistrationValidator.CurrentWeightRange(13) == (12m, 80m));
        Check("aged 14–17: 28–110 kg (unchanged)", RegistrationValidator.CurrentWeightRange(14) == (28m, 110m) && RegistrationValidator.CurrentWeightRange(17) == (28m, 110m));
        Check("aged 18+: 40–150 kg (unchanged)", RegistrationValidator.CurrentWeightRange(18) == (40m, 150m) && RegistrationValidator.CurrentWeightRange(40) == (40m, 150m));
        Check("no date of birth: the widest range, 12–150 kg", RegistrationValidator.CurrentWeightRange((int?)null) == (12m, 150m));

        // ── the S04 weights and the existing 20 kg, for a U8 athlete (competition age 7) ──
        foreach (var w in new[] { "14", "14.00", "15.4", "15.40", "15.75", "16", "16.00", "20", "12", "80" })
            Check($"U8 athlete: {w} kg accepted", Accepts(7, w));

        // ── refused ──
        foreach (var w in new[] { "11.99", "0", "-1", "-15.4", "80.01", "250", "1000", "abc", "", "  ", "15,4", "NaN", "Infinity", "1e9" })
            Check($"U8 athlete: \"{w}\" refused", !Accepts(7, w));
        Check("null refused", RegistrationValidator.CurrentWeightProblem(Born(7), null) is not null);
        Check("U16 athlete: 27.99 refused, 28 accepted (unchanged)", !Accepts(15, "27.99") && Accepts(15, "28"));
        Check("adult: 39.99 refused, 40 accepted (unchanged)", !Accepts(25, "39.99") && Accepts(25, "40"));
        var message = RegistrationValidator.CurrentWeightProblem(Born(7), "5")!.En;
        Check("the message names the age band's range", message == "Please enter a value between 12 and 80.", message);

        // ── consistency with the official classes: every category's lightest
        //    weigh-in weight (its first class limit − 2 kg) is registrable at
        //    every age that category admits ──
        foreach (var category in CompetitionCategories.All)
        foreach (var gender in new[] { "female", "male" })
        {
            var list = WeightClasses.For(category.Value, gender);
            if (list.Count == 0) continue;
            var first = list[0];
            var lightest = WeighInRange.For(category.Value, gender, first.LimitKg, first.FloorKg).MinAcceptedKg!.Value;
            for (var age = category.MinAge; age <= category.MaxAge; age++)
            {
                var (min, _) = RegistrationValidator.CurrentWeightRange(age);
                if (min > lightest)
                    Check($"{category.Value}/{gender} age {age}: {lightest} kg (lightest weigh-in) is registrable", false,
                        $"registration minimum is {min}");
            }
        }
        Check("every official category's lightest weigh-in weight is registrable at its ages", failures.Count == 0);

        Console.WriteLine(failures.Count == 0 ? "  member weight: all checks passed" : "  member weight FAILED");
        return failures.Count;
    }
}
