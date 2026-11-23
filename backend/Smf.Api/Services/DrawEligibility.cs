using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Who may be in a division's draw — the one rule every draw path uses
/// (generation, preparation, regeneration, synchronisation, the overview
/// counts and placing an athlete by hand).
///
/// Final Draw Approval (<see cref="TournamentEntry.IsQualified"/>) is not
/// enough on its own: the Passed weigh-in it rests on must still hold for the
/// class the athlete is in <b>now</b>, judged by today's rule
/// (<see cref="WeighInRange"/>). A Passed recorded for another class — before
/// a class or category change — or under a rule since replaced, never keeps an
/// athlete eligible. Nothing is changed on the entry: an approval that no
/// longer holds is reported, and it is for an administrator to resolve it.
/// </summary>
public static class DrawEligibility
{
    /// <summary>
    /// The recorded weigh-in is a Passed whose measured weight matches the
    /// division the entry is in now.
    /// </summary>
    public static bool WeighInValid(TournamentEntry entry, TournamentDivision? division) =>
        division is not null
        && entry.DivisionId == division.Id
        && entry.WeighInResult == ReadinessResults.Passed
        && entry.ActualWeightKg is { } kg
        && WeighInRange.For(division).Check(kg) == WeighInVerdict.Matches;

    /// <summary>Final Draw Approval, on a weigh-in that still holds for this division.</summary>
    public static bool Eligible(TournamentEntry entry, TournamentDivision division) =>
        entry.IsQualified && WeighInValid(entry, division);

    /// <summary>
    /// Why a Passed weigh-in does not hold for the division now, or null when
    /// it does (or there is no Passed weigh-in to judge).
    /// </summary>
    public static string? StaleWeighIn(TournamentEntry entry, TournamentDivision? division)
    {
        if (entry.WeighInResult != ReadinessResults.Passed || division is null) return null;
        if (WeighInValid(entry, division)) return null;

        var range = WeighInRange.For(division);
        if (entry.ActualWeightKg is not { } kg) return "the Passed weigh-in has no recorded weight";
        return range.Resolved
            ? $"the recorded weight of {WeighInWeights.Kg(kg)} kg does not match the current class "
              + $"{division.WeightLabel(false)} (accepted {range.Text()})"
            : $"the current class {division.WeightLabel(false)} cannot be judged: {range.Issue}";
    }
}
