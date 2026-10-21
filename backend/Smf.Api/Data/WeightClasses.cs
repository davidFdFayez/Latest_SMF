namespace Smf.Api.Data;

/// <summary>
/// The weight classes offered when a tournament is set up (REQ-01 rule 6), per
/// age category and gender.
///
/// <b>These are provisional.</b> REQ-02 rule 5 says the system uses the
/// federation's official weight classes for each age category and gender, but
/// the signed document does not list them and the attachment it refers to
/// ("ملاحظات الاتحاد السعودي للملاكمة التايلندية: انظر المرفق") did not arrive
/// with it. What follows is built from the IFMA divisions the registration
/// portal already uses, narrowed to a plausible range per age band.
///
/// Nothing downstream depends on these numbers being right: the classes a
/// tournament actually runs are chosen at setup and stored as its own
/// divisions. When the official table arrives, only this file changes, and
/// tournaments already created keep the classes they were given.
/// </summary>
public static class WeightClasses
{
    /// <summary>One class: everything up to and including <see cref="LimitKg"/>.</summary>
    public record WeightClass(decimal? LimitKg, decimal? FloorKg)
    {
        public bool IsOpen => LimitKg is null;

        public string Label(bool arabic) => IsOpen
            ? $"+{FloorKg:0.##} {(arabic ? "كجم" : "kg")}"
            : $"{LimitKg:0.##} {(arabic ? "كجم" : "kg")}";
    }

    /// <summary>The full IFMA ladder, from which each age band takes a slice.</summary>
    private static readonly decimal[] Ladder =
        [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 45, 48, 51, 54, 57, 60, 63.5m, 67, 71, 75, 81, 86, 91];

    /// <summary>
    /// The lightest and heaviest class each age band plausibly runs. A U8 draw
    /// has no 91 kg class and an Elite draw has no 20 kg one.
    /// </summary>
    private static readonly Dictionary<string, (decimal From, decimal To)> BandRange = new()
    {
        ["u8"] = (20, 32),
        ["u10"] = (24, 38),
        ["u12"] = (28, 45),
        ["u14"] = (32, 54),
        ["u16"] = (40, 67),
        ["u18"] = (45, 81),
        ["u24"] = (45, 91),
        ["elite"] = (45, 91),
        ["masters_35"] = (51, 91),
        ["masters_40"] = (51, 91),
        ["masters_45"] = (51, 91),
    };

    /// <summary>Women's classes stop at 71 kg in the IFMA ladder the portal uses.</summary>
    private const decimal FemaleCeiling = 71m;

    /// <summary>
    /// The classes offered for a category and gender, lightest first, with the
    /// open "+" class last.
    /// </summary>
    public static IReadOnlyList<WeightClass> For(string category, string gender)
    {
        if (!BandRange.TryGetValue(category, out var range)) return [];

        var ceiling = gender == "female" ? Math.Min(range.To, FemaleCeiling) : range.To;

        var limits = Ladder
            .Where(limit => limit >= range.From && limit <= ceiling)
            .OrderBy(limit => limit)
            .ToList();

        if (limits.Count == 0) return [];

        var classes = new List<WeightClass>();
        decimal? floor = null;

        foreach (var limit in limits)
        {
            classes.Add(new WeightClass(limit, floor));
            floor = limit;
        }

        // The heaviest class has no ceiling: anything above the last limit.
        classes.Add(new WeightClass(null, limits[^1]));
        return classes;
    }

    /// <summary>
    /// The class a measured weight belongs to, or null when it is below the
    /// lightest. Used at the weigh-in to see whether an athlete is still in the
    /// class they entered, and to offer the one they have landed in instead
    /// (REQ-09 rule 4).
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
}
