namespace Smf.Api.Data.Models;

/// <summary>
/// Stage 5 Step 3 — one tournament-wide publication of the bout schedule.
///
/// Publishing is all-or-nothing: the whole approved schedule is validated,
/// numbered (OfficialBoutNumber: day, then configured ring order, then the
/// bout's place in that ring's day queue; BYEs never), frozen into
/// <see cref="SnapshotJson"/> — the only thing the public website reads — and
/// recorded here. Unpublishing never deletes a row: it stamps who withdrew it,
/// when and why, so every version that was ever public stays on record.
/// </summary>
public class SchedulePublication
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    /// <summary>1, 2, 3… per tournament (unique).</summary>
    public int Version { get; set; }

    /// <summary>The schedule revision that was published (it is locked while published).</summary>
    public int ScheduleRevision { get; set; }

    public DateTime PublishedAt { get; set; } = DateTime.UtcNow;
    public string PublishedBy { get; set; } = string.Empty;

    public int BoutCount { get; set; }
    public int DivisionCount { get; set; }

    /// <summary>The public, read-only schedule exactly as published (days → rings → bouts).</summary>
    public string SnapshotJson { get; set; } = "{}";

    public DateTime? WithdrawnAt { get; set; }
    public string? WithdrawnBy { get; set; }
    public string? WithdrawReason { get; set; }

    public bool IsCurrent => WithdrawnAt is null;
}
