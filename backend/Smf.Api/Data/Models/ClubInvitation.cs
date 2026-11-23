namespace Smf.Api.Data.Models;

/// <summary>
/// A club's invitation to a coach or an athlete to join it.
///
/// Kept apart from the member's account on purpose: an invitation is a
/// question, and the club link (<see cref="MemberAccount.ClubRegistrationId"/>)
/// is the answer. The link — and with it the club's roster and statistics — is
/// written only when they accept. Until then they are not the club's.
///
/// Every invitation keeps its outcome. A rejected or cancelled one stays as it
/// is; asking again is a new invitation.
/// </summary>
public class ClubInvitation
{
    public int Id { get; set; }

    /// <summary>The inviting club's own membership record.</summary>
    public int ClubRegistrationId { get; set; }

    /// <summary>The account invited.</summary>
    public int MemberAccountId { get; set; }
    public MemberAccount? MemberAccount { get; set; }

    /// <summary>What they are invited as: <see cref="MemberAccountKinds.Coach"/> or <see cref="MemberAccountKinds.Athlete"/>.</summary>
    public string Kind { get; set; } = MemberAccountKinds.Coach;

    public string Status { get; set; } = ClubInvitationStatuses.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>The club account's email that sent it.</summary>
    public string? InvitedBy { get; set; }

    /// <summary>When it was accepted, rejected or cancelled.</summary>
    public DateTime? RespondedAt { get; set; }
}

public static class ClubInvitationStatuses
{
    public const string Pending = "pending";
    public const string Accepted = "accepted";
    public const string Rejected = "rejected";
    public const string Cancelled = "cancelled";
}
