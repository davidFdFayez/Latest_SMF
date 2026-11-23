namespace Smf.Api.Data.Models;

/// <summary>
/// REQ-11 (approved 2026-11-19): every ring has its own timing for EACH
/// tournament day — when its first bout starts and the interval between the
/// starts of consecutive bouts. The same ring may run 15:00 / 10 min on day 1
/// and 10:00 / 15 min on day 2. The interval is the ring's slot length; it is
/// not an athlete's rest period (a separate rule).
///
/// Times are wall-clock times of the tournament's own day (no time zone
/// conversion is ever applied): a date plus a time of day, as entered.
/// </summary>
public class RingDaySetting
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    public int RingId { get; set; }
    public TournamentRing? Ring { get; set; }

    /// <summary>The tournament day (date only).</summary>
    public DateTime Date { get; set; }

    public TimeSpan FirstBoutTime { get; set; }

    /// <summary>Minutes from the start of one bout to the start of the next on this ring and day.</summary>
    public int IntervalMinutes { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedBy { get; set; }
}
