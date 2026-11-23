using System.Globalization;
using Smf.Api.Data;

namespace Smf.Api.Services;

/// <summary>
/// The weights accepted at the weigh-in for one division, and the check of a
/// measured weight against them (REQ-09 rules 2 to 4; SMTF weigh-in policy
/// of 2026-11-14, which replaced the "+0.5 kg" rule and the blocked first and
/// open classes).
///
/// Every boundary comes from the official ordered list of the division's own
/// category and gender (<see cref="WeightClasses"/>), never from the classes
/// one tournament happens to run, so a tournament that leaves a class out
/// does not move anyone's boundary:
/// <list type="bullet">
/// <item><b>First class</b> of a list: from <c>limit − 2.00 kg</c> up to and
/// including its limit (both inclusive).</item>
/// <item><b>Every later bounded class</b>: above the preceding official limit
/// (exclusive) up to and including its own limit. With weights entered to two
/// decimal places, the lightest accepted weight is the preceding limit +
/// 0.01 kg; consecutive classes therefore meet with no gap and no overlap.</item>
/// <item><b>The open "+" class</b>, where the list has one: above the
/// preceding official limit (exclusive), with no upper limit.</item>
/// </list>
/// Nothing is rounded and no tolerance is added. A division whose class or
/// stored floor does not agree with the official list is reported as not
/// configured rather than validated against a guess.
/// </summary>
public sealed partial record WeighInRange(
    decimal? LowerKg,
    bool LowerInclusive,
    decimal? MaxKg,
    decimal? PreviousClassKg,
    string Kind,
    string? Issue)
{
    /// <summary>The first class of a list accepts down to its limit minus this.</summary>
    public const decimal FirstClassSpanKg = 2.00m;

    /// <summary>The finest weight the weigh-in takes: two decimal places.</summary>
    public const decimal PrecisionKg = 0.01m;

    public const int MaxDecimals = 2;

    public static class Kinds
    {
        public const string Bounded = "bounded";
        public const string First = "first";
        public const string Open = "open";
        public const string NotConfigured = "not_configured";
    }

    /// <summary>Whether the division's class is one the rules can judge.</summary>
    public bool Resolved => Kind != Kinds.NotConfigured;

    /// <summary>
    /// The lightest weight accepted at the weigh-in's precision: the inclusive
    /// minimum of a first class, or the exclusive lower boundary + 0.01 kg.
    /// For display only — <see cref="Check"/> compares with the boundary itself.
    /// </summary>
    public decimal? MinAcceptedKg => LowerKg is not { } lower ? null : LowerInclusive ? lower : lower + PrecisionKg;

    /// <summary>
    /// Resolves the range from a division's stored category, gender, limit and
    /// floor; never throws, never guesses. (The overload taking the division
    /// itself is in WeighInRange.Division.cs.)
    /// </summary>
    public static WeighInRange For(string category, string gender, decimal? limitKg, decimal? floorKg)
    {
        var table = WeightClasses.For(category, gender);
        if (table.Count == 0)
            return NotConfigured($"No weight classes are configured for {category} / {gender}.");

        var index = -1;
        for (var i = 0; i < table.Count; i++)
        {
            var entry = table[i];
            var same = limitKg is null
                ? entry.IsOpen && entry.FloorKg == floorKg
                : entry.LimitKg == limitKg;
            if (same) { index = i; break; }
        }

        if (index < 0)
            return NotConfigured(
                $"{(limitKg is null ? $"+{Kg(floorKg)}" : Kg(limitKg))} kg is not an official class for {category} / {gender}.");

        var official = table[index];
        if (official.FloorKg != floorKg)
            return NotConfigured(
                $"The division's preceding class ({(floorKg is null ? "none" : Kg(floorKg))}) does not match "
                + $"the official list ({(official.FloorKg is null ? "none" : Kg(official.FloorKg))}).");

        // Open "+" class: above the preceding official limit, no upper limit.
        if (official.IsOpen)
        {
            var floor = official.FloorKg!.Value;
            return new WeighInRange(floor, LowerInclusive: false, null, floor, Kinds.Open, null);
        }

        var limit = official.LimitKg!.Value;

        // First class of the list: limit − 2.00 kg up to the limit, both inclusive.
        if (official.FloorKg is not { } previous)
            return new WeighInRange(limit - FirstClassSpanKg, LowerInclusive: true, limit, null, Kinds.First, null);

        // Every later class: above the preceding official limit, up to its own.
        return new WeighInRange(previous, LowerInclusive: false, limit, previous, Kinds.Bounded, null);
    }

    /// <summary>
    /// The verdict for a measured weight, compared exactly as measured: nothing
    /// is rounded first and no tolerance is added. The weight's precision is
    /// checked where it enters (<see cref="WeighInWeights.HasValidPrecision"/>).
    /// </summary>
    public WeighInVerdict Check(decimal weightKg)
    {
        if (Kind == Kinds.NotConfigured) return WeighInVerdict.NotConfigured;
        if (MaxKg is { } max && weightKg > max) return WeighInVerdict.ExceedsClass;
        if (LowerKg is { } lower && (LowerInclusive ? weightKg < lower : weightKg <= lower))
            return WeighInVerdict.BelowMinimum;
        return WeighInVerdict.Matches;
    }

    /// <summary>"32.01–34 kg", "30–32 kg", "over 91 kg": what the class accepts, in words.</summary>
    public string Text() => Kind switch
    {
        Kinds.NotConfigured => "range not configured",
        Kinds.Open => $"over {Kg(LowerKg)} kg",
        _ => $"{Kg(MinAcceptedKg)}–{Kg(MaxKg)} kg",
    };

    /// <summary>For the API: the range as the Admin shows it.</summary>
    public object Describe() => new
    {
        // The lightest accepted weight at two decimals (display); the boundary itself is lowerBoundKg.
        minKg = MinAcceptedKg,
        lowerBoundKg = LowerKg,
        lowerBoundInclusive = LowerInclusive,
        maxKg = MaxKg,
        previousClassKg = PreviousClassKg,
        kind = Kind,
        resolved = Resolved,
        label = Resolved ? Text() : null,
        issue = Issue,
    };

    internal static WeighInRange NotConfigured(string issue) =>
        new(null, false, null, null, Kinds.NotConfigured, issue);

    private static string Kg(decimal? value) => value is { } v ? WeighInWeights.Kg(v) : "?";
}

/// <summary>What the scales say about a weight against the registered class.</summary>
public enum WeighInVerdict
{
    Matches,
    BelowMinimum,
    ExceedsClass,
    NotConfigured,
}

public static class WeighInVerdicts
{
    /// <summary>The API's spelling: matches, below_minimum, exceeds_class, not_configured.</summary>
    public static string Code(this WeighInVerdict verdict) => verdict switch
    {
        WeighInVerdict.Matches => "matches",
        WeighInVerdict.BelowMinimum => "below_minimum",
        WeighInVerdict.ExceedsClass => "exceeds_class",
        _ => "not_configured",
    };

    /// <summary>A mismatch the weigh-in may record as Failed or resolve with a move.</summary>
    public static bool IsMismatch(this WeighInVerdict verdict) =>
        verdict is WeighInVerdict.BelowMinimum or WeighInVerdict.ExceedsClass;
}

/// <summary>A measured weight as the weigh-in takes it and as messages show it.</summary>
public static class WeighInWeights
{
    /// <summary>
    /// At most two decimal places (32, 32.1, 32.01 — not 32.001). Judged on
    /// the value, so 32.10 is two places; nothing is rounded to make it fit.
    /// </summary>
    public static bool HasValidPrecision(decimal weightKg) =>
        decimal.Round(weightKg, WeighInRange.MaxDecimals) == weightKg;

    /// <summary>
    /// The weight exactly as stored, without trailing zeros and never rounded:
    /// 32.495 stays "32.495" (an old record), 48 is "48", 63.5 is "63.5".
    /// </summary>
    public static string Kg(decimal weightKg) =>
        weightKg.ToString("0.############################", CultureInfo.InvariantCulture);
}
