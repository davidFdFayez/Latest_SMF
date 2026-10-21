namespace Smf.Api.Data.Models;

/// <summary>
/// Round names, from the end backwards — REQ-10 rule 5.
///
/// The name depends on how far a round is from the final, not on its number, so
/// the same round 1 is "Round of 16" in one division and "Semi-final" in
/// another. A first round that byes have left partly empty is a Preliminary.
/// </summary>
public static class BoutRounds
{
    public static (string Ar, string En) Name(int round, int totalRounds, bool isPartialFirstRound)
    {
        if (round == 1 && isPartialFirstRound) return ("التصفيات التمهيدية", "Preliminary");

        return (totalRounds - round) switch
        {
            0 => ("النهائي", "Final"),
            1 => ("نصف النهائي", "Semi-final"),
            2 => ("ربع النهائي", "Quarter-final"),
            3 => ("دور الـ16", "Round of 16"),
            4 => ("دور الـ32", "Round of 32"),
            5 => ("دور الـ64", "Round of 64"),
            var away => ($"دور الـ{1 << (away + 1)}", $"Round of {1 << (away + 1)}"),
        };
    }
}
