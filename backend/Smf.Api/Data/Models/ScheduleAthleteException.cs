namespace Smf.Api.Data.Models;

/// <summary>
/// REQ-11 rule 14 exception: an authorised person allows one athlete more than
/// the default single bout on one tournament day — never more than three, and
/// never without a written reason. The two-hour minimum rest and the ban on
/// overlapping bouts still apply in full. Revoking keeps the record (who, when,
/// why); nothing is deleted.
/// </summary>
public class ScheduleAthleteException
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    /// <summary>The athlete, by registration — the same person across divisions.</summary>
    public int AthleteRegistrationId { get; set; }

    /// <summary>The tournament day the exception covers (date only).</summary>
    public DateTime Date { get; set; }

    /// <summary>Bouts allowed that day: 2 or 3.</summary>
    public int MaxBouts { get; set; }

    public string Reason { get; set; } = string.Empty;
    public string GrantedBy { get; set; } = string.Empty;
    public DateTime GrantedAt { get; set; } = DateTime.UtcNow;

    public string? RevokedBy { get; set; }
    public DateTime? RevokedAt { get; set; }
    public string? RevokeReason { get; set; }

    public bool IsActive => RevokedAt is null;
}
