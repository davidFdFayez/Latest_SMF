namespace Smf.Api.Data.Models;

/// <summary>
/// One published version of a division's draw (bracket).
///
/// Every publication is recorded here with a frozen copy of the public bracket. When a published draw is
/// regenerated (athletes approved or removed after publication), the new bracket is a Draft and the
/// current version stays what the public website shows until the updated draw is published; that
/// publication supersedes this row. Rows are never deleted, so every version that was public stays on record.
/// </summary>
public class DrawPublication
{
    public int Id { get; set; }

    public int TournamentId { get; set; }

    public int DivisionId { get; set; }
    public TournamentDivision? Division { get; set; }

    /// <summary>1, 2, 3… per division (unique).</summary>
    public int Version { get; set; }

    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;
    public string PublishedBy { get; set; } = string.Empty;

    /// <summary>Athletes placed in this version.</summary>
    public int Athletes { get; set; }

    /// <summary>The public bracket exactly as published (the website's projection).</summary>
    public string SnapshotJson { get; set; } = "{}";

    /// <summary>Internal: "round:position:corner" → entry id, so a frozen version's photos resolve to the right athlete.</summary>
    public string SlotsJson { get; set; } = "{}";

    /// <summary>Set when a later version is published; the row itself is kept.</summary>
    public DateTime? SupersededAt { get; set; }
    public string? SupersededBy { get; set; }

    public string? Note { get; set; }
}
