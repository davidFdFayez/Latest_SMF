namespace Smf.Api.Data.Models;

/// <summary>
/// One bout in a division's draw — Phase 3 REQ-10, scheduled by REQ-11.
///
/// A bout exists from the moment the draw is made, before it knows who is in
/// it: the later rounds are drawn as empty slots that winners advance into.
/// <see cref="RedEntryId"/> and <see cref="BlueEntryId"/> are therefore
/// nullable, and a bout with one side filled and a bye on the other is already
/// decided.
/// </summary>
public class Bout
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    public int DivisionId { get; set; }
    public TournamentDivision? Division { get; set; }

    /// <summary>
    /// 1 for the first round drawn, counting up to the final. Named for display
    /// by <see cref="BoutRounds"/>, which depends on how many rounds there are
    /// in total rather than on this number alone.
    /// </summary>
    public int Round { get; set; }

    /// <summary>Position within the round, from the top of the bracket down.</summary>
    public int Position { get; set; }

    /// <summary>
    /// The corner on the left of the schedule, shown in red (REQ-11 rule 3).
    /// Null means the slot is waiting for a winner, or carries a bye.
    /// </summary>
    public int? RedEntryId { get; set; }
    public TournamentEntry? RedEntry { get; set; }

    /// <summary>The corner on the right, shown in blue.</summary>
    public int? BlueEntryId { get; set; }
    public TournamentEntry? BlueEntry { get; set; }

    /// <summary>
    /// The bout this winner goes on to, and which corner they take. The final
    /// has neither.
    /// </summary>
    public int? WinnerToBoutId { get; set; }
    public string? WinnerToCorner { get; set; }

    /// <summary>
    /// A bout with one athlete and an empty opposite corner. The athlete
    /// advances without fighting (REQ-10 rule 2) and it is never scheduled.
    /// </summary>
    public bool IsBye { get; set; }

    /// <summary>Set when the opponent withdrew after the draw (REQ-10 rule 8).</summary>
    public bool IsWalkover { get; set; }

    public int? WinnerEntryId { get; set; }

    /* ── schedule (REQ-11) ──────────────────────────────────────────────── */

    public DateTime? ScheduledDate { get; set; }

    public int? RingId { get; set; }
    public TournamentRing? Ring { get; set; }

    /// <summary>Order within its ring on its day, which drives the generated start time.</summary>
    public int? OrderInRing { get; set; }

    public TimeSpan? StartTime { get; set; }

    /// <summary>
    /// An exact start time an administrator entered for this bout on the Division Schedule page (one-minute
    /// precision). When set, it is the bout's start time; otherwise the time follows from the ring/day first-bout
    /// time and interval and the bout's place in the ring queue. Cleared whenever the bout is moved by any other
    /// tool, and by Apply to All Bouts.
    /// </summary>
    public TimeSpan? ManualStartTime { get; set; }

    /// <summary>
    /// INTERNAL day-queue key kept by the scheduling engine: 1..n per tournament
    /// day, Ring A's queue first, then Ring B… It drives the slot-integrity index,
    /// athlete-safety checks and the results lock, and it is never shown as a
    /// bout number. The official number is <see cref="OfficialBoutNumber"/>.
    /// Byes never get one.
    /// </summary>
    public int? BoutNumber { get; set; }

    /// <summary>
    /// Stage 5 Step 3 — the OFFICIAL bout number, assigned only by the
    /// tournament-wide Publish Schedule: one sequence for the whole tournament,
    /// ordered by day, then configured ring order, then the bout's place in that
    /// ring's day queue (bout id breaks any tie). Null until published and again
    /// after an authorised unpublication. Byes never get one.
    /// </summary>
    public int? OfficialBoutNumber { get; set; }

    /// <summary>True when a person set the ring by hand, so a regeneration leaves it alone (REQ-11 rule 13).</summary>
    public bool RingPinned { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// A bout that needs a slot in the schedule.
    ///
    /// Everything that is an actual bout, which is everything that is not a
    /// bye. A later-round bout whose corners still read "winner of bout 10"
    /// is one of them: REQ-11 rule 11 says it takes a day, a ring, an order,
    /// a start time and a bout number before anybody knows who will be in it,
    /// and the names drop in when the earlier bouts finish. A bye never does,
    /// because a bye is not a bout.
    /// </summary>
    public bool IsSchedulable => !IsBye;
}
