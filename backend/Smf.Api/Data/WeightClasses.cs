namespace Smf.Api.Data;

/// <summary>
/// The weight classes a tournament may run, per age category and gender —
/// Phase 3 REQ-01 rule 6 and its Weight Class Mapping table, which REQ-02
/// rule 5 and REQ-03 rule 6 then use unchanged.
///
/// The table is written out cell by cell rather than derived from a ladder,
/// because the cells do not follow one: U18 women start at 42 kg and U18 men
/// at 45, U14 counts in twos up to 60 and then jumps to 63.5, and U8 and U10
/// have no open class at all. A rule that produced all of that would be a
/// worse record of the document than the document's own numbers.
///
/// The values come from the IFMA Rule 4 weight classification tables, as the
/// document states.
/// </summary>
public static class WeightClasses
{
    /// <summary>
    /// One class: everything above <see cref="FloorKg"/> up to and including
    /// <see cref="LimitKg"/>. The heaviest class of most categories is open —
    /// no limit, everything above its floor.
    /// </summary>
    public record WeightClass(decimal? LimitKg, decimal? FloorKg)
    {
        public bool IsOpen => LimitKg is null;

        public string Label(bool arabic) => IsOpen
            ? $"+{FloorKg:0.##} {(arabic ? "كجم" : "kg")}"
            : $"{LimitKg:0.##} {(arabic ? "كجم" : "kg")}";
    }

    /// <summary>
    /// A cell of the mapping: the listed limits, and whether the table ends
    /// that row with a "+" class above the last of them.
    /// </summary>
    private sealed record Row(decimal[] Limits, bool Open);

    /*  The three Masters categories run the same classes as Elite, so they
        share these two rows rather than repeating them. */
    private static readonly decimal[] SeniorMale =
        [45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75, 81, 86, 91];

    private static readonly decimal[] SeniorFemale =
        [45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75];

    /// <summary>
    /// The Weight Class Mapping, keyed "category:gender".
    ///
    /// The document marks men's 45 kg in Elite and the three Masters rows with
    /// an asterisk and does not say what it means. It is carried here as the
    /// class it is listed as; if the asterisk turns out to restrict it, this
    /// is the one place that changes.
    /// </summary>
    private static readonly Dictionary<string, Row> Mapping = new()
    {
        ["elite:male"] = new(SeniorMale, Open: true),
        ["elite:female"] = new(SeniorFemale, Open: true),

        ["masters_35:male"] = new(SeniorMale, Open: true),
        ["masters_35:female"] = new(SeniorFemale, Open: true),
        ["masters_40:male"] = new(SeniorMale, Open: true),
        ["masters_40:female"] = new(SeniorFemale, Open: true),
        ["masters_45:male"] = new(SeniorMale, Open: true),
        ["masters_45:female"] = new(SeniorFemale, Open: true),

        ["u24:male"] = new([45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75, 81, 86, 91], Open: true),
        ["u24:female"] = new([45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75], Open: true),

        ["u18:male"] = new([45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75, 81, 86, 91], Open: true),
        ["u18:female"] = new([42, 45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75], Open: true),

        ["u16:male"] = new([38, 40, 42, 45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75, 81], Open: true),
        ["u16:female"] = new([36, 38, 40, 42, 45, 48, 51, 54, 57, 60, 63.5m, 67, 71], Open: true),

        ["u14:male"] = new(
            [32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63.5m, 67, 71], Open: true),
        ["u14:female"] = new(
            [32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63.5m], Open: true),

        ["u12:male"] = new(
            [30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63.5m, 67], Open: true),
        ["u12:female"] = new(
            [30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60], Open: true),

        // U10 and U8 close at their heaviest listed class: the table gives
        // them no "+" row, so a child above it fits no class and the weigh-in
        // has to say so rather than quietly putting them in an open division.
        ["u10:male"] = new([18, 20, 22, 24, 26, 28, 30, 32, 34, 36], Open: false),
        ["u10:female"] = new([18, 20, 22, 24, 26, 28, 30, 32, 34, 36], Open: false),

        ["u8:male"] = new([16, 18, 20, 22, 24, 26, 28], Open: false),
        ["u8:female"] = new([16, 18, 20, 22, 24, 26], Open: false),
    };

    /// <summary>Whether the mapping has a row for this pairing at all.</summary>
    public static bool Knows(string category, string gender) =>
        Mapping.ContainsKey(Key(category, gender));

    /// <summary>
    /// The classes offered for a category and gender, lightest first, with the
    /// open "+" class last where the category has one.
    /// </summary>
    public static IReadOnlyList<WeightClass> For(string category, string gender)
    {
        if (!Mapping.TryGetValue(Key(category, gender), out var row)) return [];

        var classes = new List<WeightClass>(row.Limits.Length + 1);
        decimal? floor = null;

        foreach (var limit in row.Limits)
        {
            classes.Add(new WeightClass(limit, floor));
            floor = limit;
        }

        if (row.Open) classes.Add(new WeightClass(null, row.Limits[^1]));
        return classes;
    }

    /// <summary>
    /// The class a measured weight belongs to, or null when it falls outside
    /// every class the pairing runs — below the lightest, or above the
    /// heaviest where the category has no open class. Used at the weigh-in to
    /// see whether an athlete is still in the class they entered, and to offer
    /// the one they have landed in instead (REQ-09 rule 4).
    /// </summary>
    public static WeightClass? ClassFor(string category, string gender, decimal weightKg)
    {
        foreach (var entry in For(category, gender))
        {
            if (entry.IsOpen) return weightKg > entry.FloorKg ? entry : null;
            if (weightKg <= entry.LimitKg) return entry;
        }
        return null;
    }

    private static string Key(string category, string gender) =>
        $"{category}:{gender}";
}
