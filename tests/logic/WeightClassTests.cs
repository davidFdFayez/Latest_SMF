using Smf.Api.Data;

namespace Smf.Tests;

/// <summary>
/// The Weight Class Mapping table of REQ-01, checked cell by cell against the
/// document. The table is the thing a wrong entry would be hardest to notice
/// in — a missing 63.5 kg class is invisible until a tournament runs without
/// it — so every row is written out here as the document prints it rather
/// than spot-checked.
/// </summary>
public static class WeightClassTests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        /// How a row reads: the limits in order, then "+x" if it is open.
        static string Reads(string category, string gender) =>
            string.Join(", ", WeightClasses.For(category, gender)
                .Select(c => c.IsOpen ? $"+{c.FloorKg:0.##}" : $"{c.LimitKg:0.##}"));

        var table = new (string Category, string Gender, string Expected)[]
        {
            ("elite", "male", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91, +91"),
            ("elite", "female", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, +75"),

            ("masters_35", "male", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91, +91"),
            ("masters_35", "female", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, +75"),
            ("masters_40", "male", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91, +91"),
            ("masters_40", "female", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, +75"),
            ("masters_45", "male", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91, +91"),
            ("masters_45", "female", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, +75"),

            ("u24", "male", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91, +91"),
            ("u24", "female", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, +75"),

            ("u18", "male", "45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, 86, 91, +91"),
            ("u18", "female", "42, 45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, +75"),

            ("u16", "male", "38, 40, 42, 45, 48, 51, 54, 57, 60, 63.5, 67, 71, 75, 81, +81"),
            ("u16", "female", "36, 38, 40, 42, 45, 48, 51, 54, 57, 60, 63.5, 67, 71, +71"),

            ("u14", "male", "32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63.5, 67, 71, +71"),
            ("u14", "female", "32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63.5, +63.5"),

            ("u12", "male", "30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63.5, 67, +67"),
            ("u12", "female", "30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, +60"),

            ("u10", "male", "18, 20, 22, 24, 26, 28, 30, 32, 34, 36"),
            ("u10", "female", "18, 20, 22, 24, 26, 28, 30, 32, 34, 36"),

            ("u8", "male", "16, 18, 20, 22, 24, 26, 28"),
            ("u8", "female", "16, 18, 20, 22, 24, 26"),
        };

        Console.WriteLine("=== REQ-01: the Weight Class Mapping, row by row ===");
        foreach (var (category, gender, expected) in table)
        {
            var actual = Reads(category, gender);
            Check($"{category} {gender}", actual == expected, actual == expected ? "" : actual);
        }

        Console.WriteLine();
        Console.WriteLine("=== the table covers exactly the eleven categories, both genders ===");
        {
            var categories = new[]
            {
                "u8", "u10", "u12", "u14", "u16", "u18", "u24",
                "elite", "masters_35", "masters_40", "masters_45",
            };

            Check("every category has a men's and a women's row",
                categories.All(c => WeightClasses.Knows(c, "male") && WeightClasses.Knows(c, "female")));
            Check("and nothing else does",
                !WeightClasses.Knows("masters", "male") && !WeightClasses.Knows("u18", "mixed"));
            Check("an unknown pairing offers nothing rather than guessing",
                WeightClasses.For("u20", "male").Count == 0);
        }

        Console.WriteLine();
        Console.WriteLine("=== a class runs from just above the one below it up to its own limit ===");
        {
            var u18 = WeightClasses.For("u18", "male");
            Check("the lightest class has no floor", u18[0].FloorKg is null);
            Check("48 kg sits on top of 45", u18[1].LimitKg == 48 && u18[1].FloorKg == 45);
            Check("the open class has a floor and no limit",
                u18[^1].IsOpen && u18[^1].FloorKg == 91);
        }

        Console.WriteLine();
        Console.WriteLine("=== REQ-09: where a measured weight lands ===");
        {
            Check("45.0 is in the 45 kg class",
                WeightClasses.ClassFor("u18", "male", 45m)?.LimitKg == 45);
            Check("45.1 moves up to 48",
                WeightClasses.ClassFor("u18", "male", 45.1m)?.LimitKg == 48);
            Check("63.5 is its own class, not rounded",
                WeightClasses.ClassFor("u18", "male", 63.5m)?.LimitKg == 63.5m);
            Check("anything over 91 is the open class",
                WeightClasses.ClassFor("u18", "male", 120m)?.IsOpen == true);
            // The lightest class has no floor, so nobody is too light for it.
            // Every heavier class is a band, which is why an athlete who
            // registered at 48 but weighs 44 is moved down rather than passed.
            Check("nobody is too light for the lightest class",
                WeightClasses.ClassFor("u18", "male", 40m)?.LimitKg == 45);
            Check("46 kg is in the 48 band, above 45 and up to 48",
                WeightClasses.ClassFor("u18", "male", 46m) is { LimitKg: 48, FloorKg: 45 });

            // U8 and U10 have no open class, so a child over the top of the
            // table fits nowhere and the weigh-in has to say so.
            Check("a U10 child at 36 kg is in the heaviest class",
                WeightClasses.ClassFor("u10", "male", 36m)?.LimitKg == 36);
            Check("a U10 child over 36 kg is in no class",
                WeightClasses.ClassFor("u10", "male", 37m) is null);
            Check("a U8 girl over 26 kg is in no class",
                WeightClasses.ClassFor("u8", "female", 27m) is null);
            Check("though a U8 boy at 27 kg still has the 28 kg class",
                WeightClasses.ClassFor("u8", "male", 27m)?.LimitKg == 28);
        }

        Console.WriteLine();
        Console.WriteLine("=== labels read the way a scoreboard needs them ===");
        {
            var open = WeightClasses.For("elite", "male")[^1];
            Check("the open class reads +91 kg", open.Label(arabic: false) == "+91 kg", open.Label(false));
            Check("and in Arabic", open.Label(arabic: true) == "+91 كجم", open.Label(true));

            var half = WeightClasses.For("elite", "male").First(c => c.LimitKg == 63.5m);
            Check("63.5 keeps its half kilo", half.Label(arabic: false) == "63.5 kg", half.Label(false));
        }

        Console.WriteLine();
        Console.WriteLine(failures.Count == 0 ? "FAILED: none" : "FAILED: " + string.Join(", ", failures));
        return failures.Count == 0 ? 0 : 1;
    }
}
