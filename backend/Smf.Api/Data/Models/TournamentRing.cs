namespace Smf.Api.Data.Models;

/// <summary>
/// A ring at a tournament — Phase 3 REQ-11.
///
/// Rings are not set when a tournament is created (REQ-01 rule 8). They are
/// added at scheduling, once the draw shows how many bouts there are to fit,
/// and each one keeps its own start time, interval and bout order so that
/// several can run at once (REQ-11 rules 9 and 11).
/// </summary>
public class TournamentRing
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    /// <summary>"Ring A", "Ring B" — the federation's own naming.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>When the first bout in this ring starts, if it differs from the tournament's.</summary>
    public TimeSpan? FirstBoutTime { get; set; }

    /// <summary>Minutes from the start of one bout to the start of the next.</summary>
    public int? BoutIntervalMinutes { get; set; }

    /// <summary>
    /// The ring's position. It orders the rings everywhere AND drives bout
    /// numbering: each day numbers Ring 1's queue first, then Ring 2's, …
    /// </summary>
    public int SortOrder { get; set; }

    /// <summary>A deactivated ring takes no new bouts; it can only be deactivated while it holds none.</summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Bout> Bouts { get; set; } = [];
}
