using Smf.Api.Data;

namespace Smf.Tests;

/// <summary>
/// REQ-02 — competition age, eligible categories and the weight classes a
/// division may use, checked against the signed document's own table.
///
/// The categories overlap on purpose (18 is U24 and Elite, 35 is Elite and
/// Masters 35+, 40 is Elite and Masters 40+), so every expected answer below
/// is the full set, never a first match.
/// </summary>
public static class Req02Tests
{
    public static int Run()
    {
        var failures = new List<string>();

        void Check(string name, bool ok, string detail = "")
        {
            Console.WriteLine((ok ? "  PASS " : "  FAIL ") + name + (detail.Length > 0 ? " - " + detail : ""));
            if (!ok) failures.Add(name);
        }

        static string Reads(IEnumerable<CompetitionCategories.Category> categories) =>
            string.Join(" + ", categories.Select(c => c.En));

        const int Year = 2026;

        /* ── the category table itself ────────────────────────────────────── */
        var ranges = new (string Value, int Min, int Max)[]
        {
            ("u8", 6, 7), ("u10", 8, 9), ("u12", 10, 11), ("u14", 12, 13), ("u16", 14, 15),
            ("u18", 16, 17), ("u24", 18, 23), ("elite", 18, 40),
            ("masters_35", 35, 39), ("masters_40", 40, 44), ("masters_45", 45, 50),
        };
        Check("eleven categories, in the document's order",
            CompetitionCategories.All.Select(c => c.Value).SequenceEqual(ranges.Select(r => r.Value)),
            string.Join(", ", CompetitionCategories.All.Select(c => c.Value)));
        foreach (var (value, min, max) in ranges)
        {
            var category = CompetitionCategories.All.Single(c => c.Value == value);
            Check($"{category.En} is {min}–{max} inclusive", category.MinAge == min && category.MaxAge == max,
                $"{category.MinAge}–{category.MaxAge}");
        }

        /* ── the age matrix ───────────────────────────────────────────────── */
        var matrix = new (int Age, string Expected)[]
        {
            (5, ""),
            (6, "U8"), (7, "U8"),
            (8, "U10"), (9, "U10"),
            (10, "U12"), (11, "U12"),
            (12, "U14"), (13, "U14"),
            (14, "U16"), (15, "U16"),
            (16, "U18"), (17, "U18"),
            (18, "U24 + Elite"), (19, "U24 + Elite"), (23, "U24 + Elite"),
            (24, "Elite"), (34, "Elite"),
            (35, "Elite + Masters 35+"), (39, "Elite + Masters 35+"),
            (40, "Elite + Masters 40+"),
            (41, "Masters 40+"), (44, "Masters 40+"),
            (45, "Masters 45+"), (50, "Masters 45+"),
            (51, ""),
        };
        foreach (var (age, expected) in matrix)
        {
            var born = new DateTime(Year - age, 6, 15);
            var got = CompetitionCategories.EligibleForTournament(born, Year);
            Check($"age {age} → {(expected.Length == 0 ? "no category" : expected)}",
                Reads(got) == expected && CompetitionCategories.CompetitionAge(born, Year) == age,
                Reads(got));
        }

        /* ── the age is the tournament's year minus the birth year ────────── */
        Check("born 2008, tournament 2026 → competition age 18",
            CompetitionCategories.CompetitionAge(new DateTime(2008, 3, 1), 2026) == 18);
        Check("1 January and 31 December of one year give the same age",
            CompetitionCategories.CompetitionAge(new DateTime(2008, 1, 1), 2026)
            == CompetitionCategories.CompetitionAge(new DateTime(2008, 12, 31), 2026));
        Check("a 31 December birthday is U24 + Elite all year, not U18 until December",
            Reads(CompetitionCategories.EligibleForTournament(new DateTime(2008, 12, 31), 2026)) == "U24 + Elite");
        Check("the tournament's year decides, not today's: born 2009 is U18 in 2026",
            Reads(CompetitionCategories.EligibleForTournament(new DateTime(2009, 6, 1), 2026)) == "U18");
        Check("…and U24 + Elite in a 2027 tournament",
            Reads(CompetitionCategories.EligibleForTournament(new DateTime(2009, 6, 1), 2027)) == "U24 + Elite");
        Check("no date of birth → no age, no category",
            CompetitionCategories.CompetitionAge(null, Year) is null
            && CompetitionCategories.EligibleForTournament(null, Year).Count == 0);

        /* ── weight classes belong to a category AND a gender ─────────────── */
        string Limits(string category, string gender) => string.Join(",",
            WeightClasses.For(category, gender).Select(w => w.IsOpen ? $"+{w.FloorKg:0.##}" : $"{w.LimitKg:0.##}"));

        Check("U18 men and U18 women run different classes",
            Limits("u18", "male") != Limits("u18", "female"));
        Check("U18 women start at 42 kg, U18 men at 45 kg",
            Limits("u18", "female").StartsWith("42,") && Limits("u18", "male").StartsWith("45,"));
        Check("U18 men and Elite men are separate rows of the table",
            WeightClasses.Knows("u18", "male") && WeightClasses.Knows("elite", "male"));
        Check("an unknown category has no classes", WeightClasses.For("u20", "male").Count == 0);
        Check("an unknown gender has no classes", WeightClasses.For("elite", "mixed").Count == 0);
        Check("a known category with no gender has no classes", WeightClasses.For("elite", "").Count == 0);

        /* ── a division's class must be an official one for its pairing ──── */
        Check("U18 women 42 kg is official", WeightClasses.IsOfficial("u18", "female", 42, null));
        Check("U18 men 42 kg is not (men start at 45)", !WeightClasses.IsOfficial("u18", "male", 42, null));
        Check("Elite men +91 is official", WeightClasses.IsOfficial("elite", "male", null, 91));
        Check("Elite women +91 is not (women close at +75)", !WeightClasses.IsOfficial("elite", "female", null, 91));
        Check("U10 has no open class", !WeightClasses.IsOfficial("u10", "male", null, 36));
        Check("a made-up 50 kg Elite class is not official", !WeightClasses.IsOfficial("elite", "male", 50, null));

        /* ── the official order: youngest first ───────────────────────────── */
        Check("U8 sorts before U24, U24 before Elite, Elite before Masters 35+",
            CompetitionCategories.OrderOf("u8") < CompetitionCategories.OrderOf("u24")
            && CompetitionCategories.OrderOf("u24") < CompetitionCategories.OrderOf("elite")
            && CompetitionCategories.OrderOf("elite") < CompetitionCategories.OrderOf("masters_35"));

        Console.WriteLine(failures.Count == 0 ? "  REQ-02: all passed" : $"  REQ-02: {failures.Count} failed");
        return failures.Count;
    }
}
