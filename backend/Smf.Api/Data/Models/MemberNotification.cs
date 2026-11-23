namespace Smf.Api.Data.Models;

/// <summary>
/// A notice for one member account, shown in the website's notification bell.
///
/// Shared by every kind of member — club, coach, athlete, official. The text is
/// written in both languages when the event happens, and the event itself is
/// kept structured (<see cref="Type"/>, <see cref="RelatedId"/>) so a later
/// screen can act on it without parsing the words.
/// </summary>
public class MemberNotification
{
    public int Id { get; set; }

    /// <summary>The only account that may read it.</summary>
    public int MemberAccountId { get; set; }
    public MemberAccount? MemberAccount { get; set; }

    /// <summary><see cref="MemberNotificationTypes"/>.</summary>
    public string Type { get; set; } = string.Empty;

    public string TitleAr { get; set; } = string.Empty;
    public string TitleEn { get; set; } = string.Empty;
    public string BodyAr { get; set; } = string.Empty;
    public string BodyEn { get; set; } = string.Empty;

    /// <summary>Where opening it takes the member: a path on the website.</summary>
    public string? Target { get; set; }

    /// <summary>The record it is about: a club invitation, or for a club link that ended, the club.</summary>
    public int? RelatedId { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Null while unread.</summary>
    public DateTime? ReadAt { get; set; }
}

public static class MemberNotificationTypes
{
    public const string ClubInvitationReceived = "club_invitation.received";
    public const string ClubInvitationAccepted = "club_invitation.accepted";
    public const string ClubInvitationRejected = "club_invitation.rejected";
    public const string ClubInvitationCancelled = "club_invitation.cancelled";
    /// <summary>The club removed this player or coach from its roster.</summary>
    public const string ClubMembershipEnded = "club_membership.ended";
    /// <summary>A club or coach registered this athlete in a tournament.</summary>
    public const string TournamentEntryCreated = "tournament_entry.created";
}
