namespace Smf.Api.Services;

/// <summary>
/// The arithmetic of a single-elimination bracket for a division's eligible
/// (Final-Draw-Approved) athletes — what the Draw Management pages show
/// before any draw exists. Integers only: the bracket size is found by
/// doubling, never by logarithms, so there are no rounding edge cases.
///
/// For N ≥ 2: the bracket is the smallest power of two ≥ N; BYEs fill the
/// empty slots (bracket − N); the athletes who do not get a BYE meet in the
/// preliminary round ((N − BYEs) / 2 bouts); half the bracket reaches the
/// next round; and a fully contested bracket has N − 1 bouts in all.
/// N = 0 (no eligible athletes) and N = 1 (No Contest) have no bracket.
/// The supported range is up to <see cref="MaxAthletes"/> athletes.
/// </summary>
public static class DrawMath
{
    /// <summary>The largest division the current competition rules provide for.</summary>
    public const int MaxAthletes = 128;

    public enum Kind { NoEligibleAthletes, NoContest, Bracket, OverCapacity }

    public sealed record Plan(
        int Athletes,
        Kind Kind,
        int? BracketSize,
        int? Byes,
        int? PreliminaryBouts,
        int? NextRoundAthletes,
        int? TotalBouts)
    {
        /// <summary>Whether a draw may be made for this many athletes.</summary>
        public bool CanDraw => Kind == Kind.Bracket;
    }

    /// <summary>The smallest power of two that is at least <paramref name="n"/> (n ≥ 1).</summary>
    public static int BracketSize(int n)
    {
        if (n < 1) throw new ArgumentOutOfRangeException(nameof(n), "A bracket needs at least one athlete.");
        var size = 1;
        while (size < n) size *= 2;
        return size;
    }

    /// <summary>Everything the page shows for a division of <paramref name="athletes"/> eligible athletes.</summary>
    public static Plan For(int athletes)
    {
        if (athletes < 0) throw new ArgumentOutOfRangeException(nameof(athletes));
        if (athletes == 0) return new Plan(0, Kind.NoEligibleAthletes, null, null, null, null, null);
        if (athletes == 1) return new Plan(1, Kind.NoContest, null, null, null, null, null);
        if (athletes > MaxAthletes) return new Plan(athletes, Kind.OverCapacity, null, null, null, null, null);

        var size = BracketSize(athletes);
        var byes = size - athletes;
        return new Plan(
            athletes,
            Kind.Bracket,
            BracketSize: size,
            Byes: byes,
            PreliminaryBouts: (athletes - byes) / 2,
            NextRoundAthletes: size / 2,
            TotalBouts: athletes - 1);
    }
}
