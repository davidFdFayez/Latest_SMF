namespace Smf.Api.Services;

/// <summary>
/// Builds a single-elimination draw for one division — Phase 3 REQ-10.
///
/// The rules the document is exact about, and which the tests hold to:
///
/// <list type="number">
/// <item>Only qualified athletes are drawn, placed at random, with athletes
/// from the same club kept apart where that is possible (rules 1 and 4).</item>
/// <item>Byes bring the field up to the next power of two, so the round after
/// the first is a clean 4, 8, 16, 32 or 64 (rule 2).</item>
/// <item>Byes are seated first and in draw order, so an even number pairs
/// against itself and an odd number leaves the last one facing the winner of
/// the first bout (rule 3).</item>
/// <item>Nobody fights a second time before everybody has fought once
/// (rule 4).</item>
/// <item>No third-place bout — both losing semi-finalists take bronze
/// (rule 5).</item>
/// </list>
///
/// "Bye" here means what the document means: an athlete who sits out the first
/// round and enters at the second. That is why a draw of six is six athletes in
/// one preliminary bout plus four byes, and not three first-round bouts.
/// </summary>
public static class DrawBuilder
{
    /// <summary>A draw, ready to be written as <see cref="Bout"/> rows.</summary>
    public sealed record Draw(
        IReadOnlyList<PlannedBout> Bouts,
        int TotalRounds,
        int ByeCount,
        bool HasPreliminaryRound);

    /// <summary>One bout before it has an identity in the database.</summary>
    public sealed record PlannedBout(
        int Round,
        int Position,
        int? RedEntryId,
        int? BlueEntryId,
        bool IsBye)
    {
        /// <summary>Where this winner goes, filled in once the next round exists.</summary>
        public int? WinnerToPosition { get; set; }
        public string? WinnerToCorner { get; set; }
    }

    /// <summary>An athlete in the pool, with the club they are kept apart from.</summary>
    public sealed record Contender(int EntryId, string? Club);

    /// <summary>
    /// Draws the division.
    /// </summary>
    /// <param name="contenders">The qualified pool. Fewer than two produces no bouts.</param>
    /// <param name="seed">
    /// Fixes the random order. Supplied by the caller so a draw can be
    /// reproduced in a dispute, and so the tests are deterministic.
    /// </param>
    public static Draw Build(IReadOnlyList<Contender> contenders, int seed)
    {
        var count = contenders.Count;
        if (count < 2) return new Draw([], 0, 0, false);

        var ordered = Spread(contenders, seed);

        // The bracket is the next power of two at or above the field, and the
        // byes are the gap. Six athletes means a bracket of eight and two byes.
        var bracket = 1;
        while (bracket < count) bracket <<= 1;

        var byeCount = bracket - count;
        var totalRounds = (int)Math.Log2(bracket);

        // Athletes who have to fight in round one: everyone who is not a bye.
        var fighting = ordered.Take(count - byeCount).ToList();
        var byes = ordered.Skip(count - byeCount).ToList();

        var firstRoundBouts = fighting.Count / 2;
        var hasPreliminary = byeCount > 0;

        var bouts = new List<PlannedBout>();

        /* ── round one ─────────────────────────────────────────────────────
           The byes first, in draw order, then the contested bouts in bout
           order. That ordering is rule 3 itself, and it produces both of the
           document's worked examples without a special case for either:

             10 athletes, 6 byes (even) — slots 1-6 are byes and 7-8 the two
             bouts, so round two reads A1vA2, A3vA4, A5vA6, and last
             W(A7vA8) v W(A9vA10): byes paired against each other first,
             winners after.

             9 athletes, 7 byes (odd) — slots 1-7 are byes and 8 the one bout,
             so round two reads A1vA2, A3vA4, A5vA6, A7 v W(A8vA9): the one
             bye left over is the last, and it meets the winner of the first
             bout.

           Putting the bouts first would give the same pairings mirrored, which
           is the same competition but not the running order the document
           describes. */
        foreach (var (bye, index) in byes.Select((value, index) => (value, index)))
        {
            // A bye is recorded as a bout with one corner empty, so the bracket
            // is a complete tree and the athlete's path is visible.
            bouts.Add(new PlannedBout(1, index + 1, bye.EntryId, null, true));
        }

        for (var i = 0; i < firstRoundBouts; i++)
        {
            bouts.Add(new PlannedBout(
                1, byes.Count + i + 1, fighting[i * 2].EntryId, fighting[(i * 2) + 1].EntryId, false));
        }

        /* ── the rounds above ─────────────────────────────────────────────
           Each one is half the size of the one below, and slots are filled by
           the winners in order. */
        var previousRoundSize = bouts.Count;
        for (var round = 2; round <= totalRounds; round++)
        {
            var size = previousRoundSize / 2;
            for (var position = 1; position <= size; position++)
            {
                bouts.Add(new PlannedBout(round, position, null, null, false));
            }
            previousRoundSize = size;
        }

        Link(bouts, totalRounds);
        Advance(bouts);

        return new Draw(bouts, totalRounds, byeCount, hasPreliminary);
    }

    /// <summary>
    /// Random order, then club separation: an athlete whose neighbour shares
    /// their club is swapped further down the list where somebody suitable can
    /// be found. "Where possible" is the document's own wording — a division
    /// where one club brought most of the field cannot be fully separated, and
    /// the draw proceeds rather than failing.
    /// </summary>
    private static List<Contender> Spread(IReadOnlyList<Contender> contenders, int seed)
    {
        var random = new Random(seed);
        var ordered = contenders.OrderBy(_ => random.Next()).ToList();

        for (var i = 0; i + 1 < ordered.Count; i += 2)
        {
            if (!SameClub(ordered[i], ordered[i + 1])) continue;

            // Look for anyone later in the list who clashes with neither this
            // athlete nor their own new neighbour.
            for (var j = i + 2; j < ordered.Count; j++)
            {
                var partner = j % 2 == 0 ? j + 1 : j - 1;
                var partnerOk = partner >= ordered.Count || !SameClub(ordered[i + 1], ordered[partner]);

                if (SameClub(ordered[i], ordered[j]) || !partnerOk) continue;

                (ordered[i + 1], ordered[j]) = (ordered[j], ordered[i + 1]);
                break;
            }
        }

        return ordered;
    }

    private static bool SameClub(Contender a, Contender b) =>
        !string.IsNullOrWhiteSpace(a.Club)
        && string.Equals(a.Club, b.Club, StringComparison.OrdinalIgnoreCase);

    /// <summary>Points each bout at the slot its winner takes in the round above.</summary>
    private static void Link(List<PlannedBout> bouts, int totalRounds)
    {
        for (var round = 1; round < totalRounds; round++)
        {
            var current = bouts.Where(b => b.Round == round).OrderBy(b => b.Position).ToList();

            for (var i = 0; i < current.Count; i++)
            {
                current[i].WinnerToPosition = (i / 2) + 1;
                current[i].WinnerToCorner = i % 2 == 0 ? "red" : "blue";
            }
        }
    }

    /// <summary>
    /// Walks the byes up the bracket. An athlete with no opponent is already
    /// through, so their slot in the next round is filled immediately — and if
    /// that leaves another bout with one athlete and an empty corner, it is a
    /// bye in turn.
    /// </summary>
    private static void Advance(List<PlannedBout> bouts)
    {
        var byPosition = bouts.ToDictionary(b => (b.Round, b.Position));

        foreach (var bout in bouts.OrderBy(b => b.Round).ThenBy(b => b.Position))
        {
            if (!bout.IsBye) continue;
            if (bout.WinnerToPosition is not { } nextPosition) continue;
            if (!byPosition.TryGetValue((bout.Round + 1, nextPosition), out var next)) continue;

            var winner = bout.RedEntryId ?? bout.BlueEntryId;
            if (winner is null) continue;

            var updated = bout.WinnerToCorner == "red"
                ? next with { RedEntryId = winner }
                : next with { BlueEntryId = winner };

            updated.WinnerToPosition = next.WinnerToPosition;
            updated.WinnerToCorner = next.WinnerToCorner;

            var index = bouts.IndexOf(next);
            bouts[index] = updated;
            byPosition[(updated.Round, updated.Position)] = updated;
        }
    }
}
