namespace Smf.Api.Data.Models;

/// <summary>
/// The tournament-type and competition-type lists — Phase 3 REQ-01 rules 2
/// and 3, both of which say an authorised user may add a new entry.
///
/// That is why these live in a table rather than in an enum: the federation
/// adding "بطولة دولية" should not be a release. The values the document
/// names are seeded on startup and cannot be removed, because tournaments
/// already refer to them; anything added afterwards belongs to the federation.
///
/// REQ-01 rule 7 — the system's existing rules apply unchanged to whatever is
/// added. Nothing downstream branches on the type, so that holds by
/// construction.
/// </summary>
public class TournamentLookup
{
    public int Id { get; set; }

    /// <summary><see cref="LookupKinds"/> — which of the two lists this belongs to.</summary>
    public string Kind { get; set; } = string.Empty;

    /// <summary>The stored value, e.g. <c>kingdom</c>. Lower case, no spaces.</summary>
    public string Value { get; set; } = string.Empty;

    public string NameAr { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;

    public int SortOrder { get; set; }

    /// <summary>
    /// True for the entries the signed document names. They are seeded, kept
    /// up to date, and cannot be deleted.
    /// </summary>
    public bool IsSeeded { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? CreatedBy { get; set; }
}

public static class LookupKinds
{
    public const string TournamentType = "tournament_type";
    public const string CompetitionType = "competition_type";

    public static readonly IReadOnlyList<string> All = [TournamentType, CompetitionType];
}
