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

    /// <summary>Ordering in the UI, so rings read A, B, C rather than by id.</summary>
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Bout> Bouts { get; set; } = [];
}
