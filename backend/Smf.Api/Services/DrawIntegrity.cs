namespace Smf.Api.Services;

/// <summary>
/// The invariants every stored single-elimination draw must satisfy after any
/// change (DRW-003, DRW-004, DRW-005 remediation). Pure logic over plain rows,
/// so it is unit-tested without a database (tests/logic) and run by
/// <see cref="DrawService"/> before every draw write is committed: a change
/// that breaks one of these rules is rolled back, never saved.
///
/// The rules, in the vocabulary of REQ-10:
/// <list type="number">
/// <item>Shape: rounds 1..R, round r has half the rows of round r−1, exactly one Final, no third-place bout.</item>
/// <item>Links: every row below the Final points at (r+1, ⌈p/2⌉), red when p is odd and blue when even;
/// each corner of a later round is fed by exactly one row.</item>
/// <item>No athlete appears twice in a round; the round-1 athletes are exactly the expected set when one is given.</item>
/// <item>Draw BYEs (IsBye, not a walkover) are round-1 rows, seated first (positions 1..k), red corner only.
/// While the draw is untouched by withdrawals k = bracket − athletes.</item>
/// <item>Contested round-1 rows hold two athletes unless a walkover emptied one corner.</item>
/// <item>A walkover keeps one athlete, names them as winner, and is not counted as a BYE.</item>
/// <item>A corner in round 2 or later holds exactly who its feeder row advanced: a BYE holder, a walkover or
/// result winner — or nobody while the feeder is undecided.</item>
/// </list>
/// </summary>
public static class DrawIntegrity
{
    /// <summary>One stored bout, reduced to what the invariants need.</summary>
    public sealed record Row(
        int Id,
        int Round,
        int Position,
        int? Red,
        int? Blue,
        bool IsBye,
        bool IsWalkover,
        int? Winner,
        int? WinnerToBoutId,
        string? WinnerToCorner);

    /// <summary>Every broken rule, empty when the draw is sound.</summary>
    /// <param name="expectedRoundOne">When given, the round-1 athletes must be exactly these.</param>
    /// <param name="departed">Athletes who withdrew after the draw: their later-round corner may be empty.</param>
    public static IReadOnlyList<string> Check(
        IReadOnlyCollection<Row> rows,
        IReadOnlyCollection<int>? expectedRoundOne = null,
        IReadOnlyCollection<int>? departed = null)
    {
        var problems = new List<string>();
        if (rows.Count == 0) return problems;

        var byId = rows.ToDictionary(r => r.Id);
        var totalRounds = rows.Max(r => r.Round);
        var rounds = Enumerable.Range(1, totalRounds)
            .Select(round => rows.Where(r => r.Round == round).OrderBy(r => r.Position).ToList())
            .ToList();

        // 1. Shape.
        var firstSize = rounds[0].Count;
        if (firstSize != 1 << (totalRounds - 1))
            problems.Add($"round 1 has {firstSize} rows; a {totalRounds}-round bracket needs {1 << (totalRounds - 1)}");
        for (var round = 1; round <= totalRounds; round++)
        {
            var list = rounds[round - 1];
            var expected = 1 << (totalRounds - round);
            if (list.Count != expected) problems.Add($"round {round} has {list.Count} rows, expected {expected}");
            for (var i = 0; i < list.Count; i++)
                if (list[i].Position != i + 1) problems.Add($"round {round} positions are not 1..{list.Count}");
        }
        if (rounds[^1].Count != 1) problems.Add("there must be exactly one Final");

        // 2. Links.
        var fedBy = new Dictionary<(int BoutId, string Corner), int>();
        foreach (var row in rows)
        {
            if (row.Round == totalRounds)
            {
                if (row.WinnerToBoutId is not null) problems.Add($"the Final (bout {row.Id}) must not lead anywhere");
                continue;
            }
            var targetPosition = (row.Position + 1) / 2;
            var corner = row.Position % 2 == 1 ? "red" : "blue";
            if (row.WinnerToBoutId is not { } next || !byId.TryGetValue(next, out var target)
                || target.Round != row.Round + 1 || target.Position != targetPosition || row.WinnerToCorner != corner)
            {
                problems.Add($"bout {row.Id} (round {row.Round}, position {row.Position}) is not linked to round {row.Round + 1} position {targetPosition} {corner}");
                continue;
            }
            if (!fedBy.TryAdd((next, corner), row.Id)) problems.Add($"bout {next} {corner} corner is fed twice");
        }

        // 3. Each athlete once per round; the expected round-1 field.
        foreach (var list in rounds)
        {
            var seen = new HashSet<int>();
            foreach (var athlete in list.SelectMany(r => new[] { r.Red, r.Blue }).OfType<int>())
                if (!seen.Add(athlete)) problems.Add($"entry {athlete} appears twice in round {list[0].Round}");
        }
        if (expectedRoundOne is not null)
        {
            var placed = rounds[0].SelectMany(r => new[] { r.Red, r.Blue }).OfType<int>().ToHashSet();
            var expected = expectedRoundOne.ToHashSet();
            foreach (var missing in expected.Except(placed).OrderBy(x => x)) problems.Add($"entry {missing} is missing from the draw");
            foreach (var extra in placed.Except(expected).OrderBy(x => x)) problems.Add($"entry {extra} is in the draw but should not be");
        }

        // 4–6. Round one: BYEs first, contests full, walkovers well-formed.
        var drawByes = rounds[0].Where(r => r.IsBye && !r.IsWalkover).ToList();
        for (var i = 0; i < drawByes.Count; i++)
            if (drawByes[i].Position != i + 1) problems.Add("BYE rows are not seated first in round 1");
        foreach (var row in rows)
        {
            if (row.IsBye && !row.IsWalkover)
            {
                if (row.Round != 1) problems.Add($"bout {row.Id} is a BYE outside round 1");
                if (row.Blue is not null) problems.Add($"BYE bout {row.Id} has an athlete in the blue corner");
                if (row.Winner is not null) problems.Add($"BYE bout {row.Id} carries a winner");
            }
            if (row.IsWalkover)
            {
                var remaining = row.Red ?? row.Blue;
                if (row.Red is not null && row.Blue is not null) problems.Add($"walkover bout {row.Id} still has both athletes");
                if (remaining is null || row.Winner != remaining) problems.Add($"walkover bout {row.Id} does not name its remaining athlete as winner");
            }
            if (row.Round == 1 && !row.IsBye && !row.IsWalkover && (row.Red is null || row.Blue is null))
                problems.Add($"round-1 bout {row.Id} is contested but has an empty corner");
            if (row.Winner is { } w && !row.IsWalkover && row.Red != w && row.Blue != w)
                problems.Add($"bout {row.Id} names a winner who is not in it");
        }
        var untouched = rows.All(r => !r.IsWalkover && r.Winner is null) && drawByes.All(r => r.Red is not null);
        if (untouched)
        {
            var athletes = rounds[0].Sum(r => (r.Red is null ? 0 : 1) + (r.Blue is null ? 0 : 1));
            var bracket = firstSize * 2;
            if (drawByes.Count != bracket - athletes)
                problems.Add($"{drawByes.Count} BYE(s) for {athletes} athletes in a bracket of {bracket}; expected {bracket - athletes}");
        }

        // 7. Later corners hold exactly what their feeder advanced.
        foreach (var row in rows)
        {
            if (row.WinnerToBoutId is not { } next || !byId.TryGetValue(next, out var target)) continue;
            int? advanced = row.IsBye && !row.IsWalkover ? row.Red
                : row.Winner;
            var actual = row.WinnerToCorner == "red" ? target.Red : target.Blue;
            if (actual != advanced)
            {
                // A withdrawal empties the withdrawn athlete's later corner; a walkover there is fine.
                var emptiedByWithdrawal = actual is null
                    && (target.IsWalkover || (advanced is { } gone && departed is not null && departed.Contains(gone)));
                if (!emptiedByWithdrawal)
                    problems.Add($"bout {target.Id} {row.WinnerToCorner} corner holds {actual?.ToString() ?? "nobody"} but bout {row.Id} advances {advanced?.ToString() ?? "nobody yet"}");
            }
        }

        return problems.Distinct().ToList();
    }
}
