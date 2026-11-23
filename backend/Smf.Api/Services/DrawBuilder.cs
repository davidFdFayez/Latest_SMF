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

        // The bracket is the next power of two at or above the field, and the
        // byes are the gap. Six athletes means a bracket of eight and two byes.
        var bracket = 1;
        while (bracket < count) bracket <<= 1;

        var byeCount = bracket - count;
        var totalRounds = (int)Math.Log2(bracket);

        // Random order with club separation over every first meeting — the
        // contested pairs, the BYE pairs, and (with an odd number of byes) the
        // last bye against both athletes of the first contested bout (DRW-001).
        var ordered = Arrange(contenders, byeCount, seed);

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
    /// The version of the arrangement below, written into every draw's audit
    /// line with its seed, so an old seed stays interpretable: the same seed
    /// gives a different draw under v1 (forward-only separation, before the
    /// DRW-001 remediation) than under v2.
    /// </summary>
    public const string AlgorithmVersion = "v2";

    /// <summary>
    /// The draw order: a seeded random shuffle, then club separation over every
    /// first meeting. "Where possible" is the document's own wording — a
    /// division where one club brought most of the field cannot be fully
    /// separated, and the draw proceeds rather than failing — but where it is
    /// possible it is now always achieved (DRW-001): the shuffle is repaired by
    /// swaps anywhere in the list, not only further down it, and a constructive
    /// arrangement (largest club paired first) is used when the repaired
    /// shuffle still has more clashes. Deterministic for a given seed.
    ///
    /// Positions: pairs (0,1), (2,3), … are the first meetings — contested
    /// bouts first, then BYE pairs. With an odd number of byes the last athlete
    /// is the single bye who meets the winner of pair (0,1).
    /// </summary>
    internal static List<Contender> Arrange(IReadOnlyList<Contender> contenders, int byeCount, int seed)
    {
        var random = new Random(seed);
        var shuffled = contenders.OrderBy(_ => random.Next()).ToList();
        var single = byeCount % 2 == 1 && contenders.Count >= 3;

        var repaired = Improve(new List<Contender>(shuffled), single);
        var repairedClashes = Clashes(repaired, single);
        if (repairedClashes == 0) return repaired;

        var built = Improve(Construct(shuffled, single, random), single);
        return Clashes(built, single) < repairedClashes ? built : repaired;
    }

    /// <summary>
    /// The cost of same-club first meetings in an arrangement (see <see cref="Arrange"/>).
    /// A pair that will certainly meet (a contested bout, or two BYE holders)
    /// costs 2; the odd BYE holder against either athlete of the first bout —
    /// a meeting that happens only if that athlete wins — costs 1. So a
    /// certain clash is never accepted to avoid a possible one.
    /// </summary>
    internal static int Clashes(IReadOnlyList<Contender> list, bool single)
    {
        var n = list.Count;
        var pairsEnd = single ? n - 1 : n;
        var clashes = 0;
        for (var i = 0; i + 1 < pairsEnd; i += 2)
            if (SameClub(list[i], list[i + 1])) clashes += 2;
        if (single && n >= 3)
        {
            if (SameClub(list[n - 1], list[0])) clashes++;
            if (SameClub(list[n - 1], list[1])) clashes++;
        }
        return clashes;
    }

    private static bool InClash(IReadOnlyList<Contender> list, int i, bool single)
    {
        var n = list.Count;
        if (single && i == n - 1) return SameClub(list[i], list[0]) || SameClub(list[i], list[1]);
        var partner = i % 2 == 0 ? i + 1 : i - 1;
        var pairsEnd = single ? n - 1 : n;
        if (partner < pairsEnd && SameClub(list[i], list[partner])) return true;
        return single && i <= 1 && SameClub(list[i], list[n - 1]);
    }

    /// <summary>Swaps anywhere in the list while a swap strictly reduces the clashes.</summary>
    private static List<Contender> Improve(List<Contender> list, bool single)
    {
        var cost = Clashes(list, single);
        var improved = true;
        while (cost > 0 && improved)
        {
            improved = false;
            for (var i = 0; i < list.Count && !improved; i++)
            {
                if (!InClash(list, i, single)) continue;
                for (var j = 0; j < list.Count; j++)
                {
                    if (j == i) continue;
                    (list[i], list[j]) = (list[j], list[i]);
                    var after = Clashes(list, single);
                    if (after < cost)
                    {
                        cost = after;
                        improved = true;
                        break;
                    }
                    (list[i], list[j]) = (list[j], list[i]);
                }
            }
        }
        return list;
    }

    /// <summary>
    /// A constructive arrangement that reaches the fewest possible clashes:
    /// the single bye's trio is taken from the three largest clubs, then the
    /// largest remaining club is always paired with the next largest. The
    /// pairs' order and corners are then shuffled with the same seeded random.
    /// </summary>
    private static List<Contender> Construct(IReadOnlyList<Contender> shuffled, bool single, Random random)
    {
        static string Key(Contender c) =>
            string.IsNullOrWhiteSpace(c.Club) ? "#" + c.EntryId : c.Club.Trim().ToUpperInvariant();

        var order = shuffled.Select((c, i) => (c, i)).ToDictionary(x => x.c, x => x.i);
        var groups = shuffled.GroupBy(Key).ToDictionary(g => g.Key, g => new Queue<Contender>(g));

        List<string> Largest() => groups.Where(g => g.Value.Count > 0)
            .OrderByDescending(g => g.Value.Count)
            .ThenBy(g => order[g.Value.Peek()])
            .Select(g => g.Key)
            .ToList();

        var n = shuffled.Count;
        var result = new Contender[n];
        var first = 0;
        if (single)
        {
            var keys = Largest();
            var trio = new List<Contender>();
            for (var t = 0; t < 3; t++)
            {
                var available = Largest();
                var pick = keys.FirstOrDefault(k => groups[k].Count > 0 && trio.All(x => Key(x) != k)) ?? available[0];
                trio.Add(groups[pick].Dequeue());
            }
            for (var t = trio.Count - 1; t > 0; t--)
            {
                var swap = random.Next(t + 1);
                (trio[t], trio[swap]) = (trio[swap], trio[t]);
            }
            result[0] = trio[0];
            result[1] = trio[1];
            result[n - 1] = trio[2];
            first = 2;
        }

        var pairs = new List<(Contender A, Contender B)>();
        while (groups.Values.Sum(q => q.Count) >= 2)
        {
            var keys = Largest();
            var a = groups[keys[0]].Dequeue();
            var bKey = keys.Count > 1 ? keys[1] : keys[0];
            var b = groups[bKey].Dequeue();
            pairs.Add((a, b));
        }
        for (var t = pairs.Count - 1; t > 0; t--)
        {
            var swap = random.Next(t + 1);
            (pairs[t], pairs[swap]) = (pairs[swap], pairs[t]);
        }
        foreach (var (a, b) in pairs)
        {
            var flip = random.Next(2) == 1;
            result[first++] = flip ? b : a;
            result[first++] = flip ? a : b;
        }
        return result.ToList();
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
