namespace Smf.Api.Data.Models;

/// <summary>
/// An account held by a club, a coach or an athlete — Phase 3 REQ-05, REQ-06
/// and REQ-07.
///
/// Deliberately a separate table from <see cref="AdminUser"/>. These are
/// members of the public, there will eventually be thousands of them, and they
/// must never be able to reach the console no matter how roles are edited —
/// keeping the two apart makes that structural rather than something a
/// misconfigured role could undo.
///
/// An account is always attached to a membership record: it is a way for a
/// beneficiary to reach their own registration, not an identity of its own.
/// </summary>
public class MemberAccount
{
    public int Id { get; set; }

    /// <summary>Lower-cased. The address an invitation was sent to, and the sign-in name.</summary>
    public string Email { get; set; } = string.Empty;

    public string? DisplayName { get; set; }

    /// <summary>athlete, coach or club — which portal this account opens.</summary>
    public string Kind { get; set; } = MemberAccountKinds.Athlete;

    /// <summary>The membership this account speaks for.</summary>
    public int RegistrationId { get; set; }
    public Registration? Registration { get; set; }

    /// <summary>
    /// The club an athlete or coach belongs to, as a club's own membership
    /// record. REQ-06 rule 1: a coach joining a club is linked to it, and
    /// their page then shows that club's athletes.
    /// </summary>
    public int? ClubRegistrationId { get; set; }

    /* ── credentials ────────────────────────────────────────────────────── */

    /// <summary>Null until the invitation is accepted and a password chosen.</summary>
    public string? PasswordHash { get; set; }

    /// <summary>The salt that goes with it — the same scheme the console uses.</summary>
    public string? PasswordSalt { get; set; }

    /// <summary>
    /// Changes whenever the password does, which invalidates tokens issued
    /// before — the same mechanism the console uses.
    /// </summary>
    public string SecurityStamp { get; set; } = Guid.NewGuid().ToString("N");

    public bool IsActive { get; set; } = true;

    public DateTime? LastLoginAt { get; set; }

    /* ── invitation (REQ-05 rule 2) ─────────────────────────────────────── */

    /// <summary>SHA-256 of the invitation token. Null once accepted or expired.</summary>
    public string? InviteTokenHash { get; set; }
    public DateTime? InviteSentAt { get; set; }
    public DateTime? InviteExpiresAt { get; set; }
    public DateTime? ActivatedAt { get; set; }

    /// <summary>Who invited them, so a pending row can say where it came from.</summary>
    public string? InvitedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// An invitation that has been sent and not yet taken up. REQ-05 rule 2
    /// shows these in the club's list as pending until they are completed.
    /// </summary>
    public bool IsPending => ActivatedAt is null;

    public bool CanSignIn => IsActive && ActivatedAt is not null && PasswordHash is not null;

    public bool InviteUsable(DateTime asOf) =>
        InviteTokenHash is not null && InviteExpiresAt is { } expiry && expiry > asOf;
}

public static class MemberAccountKinds
{
    public const string Athlete = "athlete";
    public const string Coach = "coach";
    public const string Club = "club";

    public static readonly IReadOnlyList<string> All = [Athlete, Coach, Club];

    /// <summary>The membership type each kind of account speaks for.</summary>
    public static string? RegistrationType(string kind) => kind switch
    {
        Athlete => "athlete",
        Coach => "coach",
        Club => "club",
        _ => null,
    };

    public static (string Ar, string En) Label(string kind) => kind switch
    {
        Athlete => ("لاعب", "Athlete"),
        Coach => ("مدرب", "Coach"),
        Club => ("نادي", "Club"),
        _ => (kind, kind),
    };
}

/// <summary>
/// A change an account holder made to their own details, waiting for an
/// administrator.
///
/// REQ-05 rule 6, REQ-06 rule 6 and REQ-07 rule 6 all say the same thing: once
/// an account exists, an edit to its details is not adopted until an
/// authorised user approves it. One table serves all three.
/// </summary>
public class MemberProfileChange
{
    public int Id { get; set; }

    public int MemberAccountId { get; set; }
    public MemberAccount? MemberAccount { get; set; }

    public int RegistrationId { get; set; }

    /// <summary>The proposed values, as a JSON object of field → new value.</summary>
    public string ChangesJson { get; set; } = "{}";

    public string Status { get; set; } = ProfileChangeStatuses.Pending;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReviewedAt { get; set; }
    public string? ReviewedBy { get; set; }
    public string? ReviewNote { get; set; }
}

public static class ProfileChangeStatuses
{
    public const string Pending = "pending";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
}
