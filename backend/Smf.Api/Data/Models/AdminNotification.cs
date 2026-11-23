namespace Smf.Api.Data.Models;

/// <summary>
/// A notice in the Admin Notification Center (the bell in the Admin top bar). Informational only: creating,
/// reading or resolving one never changes a draw, a schedule or anything else.
///
/// Who sees it is decided by <see cref="Permissions"/> (any one of them grants it), checked against the
/// administrator's current permissions on every read. Read state is per administrator
/// (<see cref="AdminNotificationRead"/>), so it survives refreshing and signing in again.
/// </summary>
public class AdminNotification
{
    public int Id { get; set; }

    /// <summary><see cref="AdminNotificationTypes"/> — new kinds are added there.</summary>
    public string Type { get; set; } = string.Empty;

    public int? TournamentId { get; set; }

    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;

    /// <summary>An Admin path (always starting with "/") opened when the notification is clicked.</summary>
    public string? Link { get; set; }

    /// <summary>Comma-separated permissions; an administrator holding any of them sees the notification.</summary>
    public string Permissions { get; set; } = string.Empty;

    /// <summary>What the notice is about (e.g. the affected divisions and their draw versions); the same key twice is a duplicate.</summary>
    public string DedupeKey { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Last time the content changed (a further affected division was added to an open notice).</summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Set when the situation it reports no longer holds; the notice stays in history.</summary>
    public DateTime? ResolvedAt { get; set; }
    public string? ResolvedNote { get; set; }
}

/// <summary>One administrator has read one notification.</summary>
public class AdminNotificationRead
{
    public int Id { get; set; }
    public int NotificationId { get; set; }
    public AdminNotification? Notification { get; set; }
    public int AdminUserId { get; set; }
    public DateTime ReadAt { get; set; } = DateTime.UtcNow;
}

public static class AdminNotificationTypes
{
    /// <summary>A published draw change affects a published bout schedule (Draw Management → Bout Schedule).</summary>
    public const string ScheduleUpdateRequired = "schedule_update_required";

    // Future kinds (not implemented yet): draw awaiting approval/publication, schedule submitted for review,
    // schedule approved/rejected, tournament registration changes.
}
