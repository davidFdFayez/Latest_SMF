namespace Smf.Api.Data.Models;

/// <summary>
/// An immutable record of an administrative action.
///
/// The Phase 2 document assumes decisions are attributable — §6 assigns قبول,
/// رفض, تعديل, and تعليق/إلغاء to named roles, which only means something if
/// the system records who actually did it. Phase 1 compliance case P6 asks for
/// the same thing: "Admin actions (approve/reject/edit) are logged — audit
/// trail records actor, action, timestamp."
///
/// Entries are only ever appended. Nothing in the API updates or deletes one.
/// </summary>
public class AuditLogEntry
{
    public int Id { get; set; }

    /// <summary>The admin user id from the bearer token, when the action had one.</summary>
    public int? ActorId { get; set; }

    /// <summary>Username captured at the time, so the trail survives the account being renamed or removed.</summary>
    public string ActorName { get; set; } = string.Empty;

    /// <summary>The actor's role keys at the time of the action, comma-separated.</summary>
    public string? ActorRole { get; set; }

    /// <summary>What was done — see <see cref="AuditActions"/>.</summary>
    public string Action { get; set; } = string.Empty;

    /// <summary>The kind of record acted on, e.g. "registration".</summary>
    public string EntityType { get; set; } = string.Empty;

    public int EntityId { get; set; }

    /// <summary>Human-readable handle for the record, e.g. the reference number.</summary>
    public string? EntityRef { get; set; }

    /// <summary>Status before the action, for lifecycle changes.</summary>
    public string? FromStatus { get; set; }

    /// <summary>Status after the action.</summary>
    public string? ToStatus { get; set; }

    /// <summary>The reason or note supplied with the action, where one was required.</summary>
    public string? Details { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>The audited action vocabulary.</summary>
public static class AuditActions
{
    public const string StatusChanged = "registration.status_changed";
    public const string Edited = "registration.edited";
    public const string Renewed = "registration.renewed";
    public const string Suspended = "registration.suspended";
    public const string Reinstated = "registration.reinstated";
    public const string Expired = "registration.expired";
    public const string Exported = "registration.exported";
    public const string Deleted = "registration.deleted";
    public const string AttachmentViewed = "registration.attachment_viewed";

    /// <summary>BUG-11 — a reviewer added or removed one of an applicant's documents.</summary>
    /* ── Phase 3: running a tournament ─────────────────────────────────── */
    public const string TournamentCreated = "tournament.created";
    public const string TournamentUpdated = "tournament.updated";
    public const string TournamentPublished = "tournament.published";
    public const string EntryCreated = "tournament.entry_created";
    public const string EntryUpdated = "tournament.entry_updated";
    public const string EntryWithdrawn = "tournament.entry_withdrawn";
    public const string CheckedIn = "tournament.checked_in";
    public const string MedicalRecorded = "tournament.medical_recorded";
    public const string WeighInRecorded = "tournament.weigh_in_recorded";
    public const string ReadinessApproved = "tournament.readiness_approved";
    public const string DrawCreated = "tournament.draw_created";
    public const string DrawPublished = "tournament.draw_published";
    public const string DrawAmended = "tournament.draw_amended";
    public const string ScheduleGenerated = "tournament.schedule_generated";
    public const string ScheduleAmended = "tournament.schedule_amended";
    public const string ScheduleApproved = "tournament.schedule_approved";
    public const string MemberAccountInvited = "member_account.invited";
    public const string MemberAccountUpdated = "member_account.updated";
    public const string ProfileChangeReviewed = "member_account.change_reviewed";
    public const string SuspensionAdded = "athlete.suspension_added";
    public const string SuspensionLifted = "athlete.suspension_lifted";
    public const string MedicalFileUpdated = "athlete.medical_file_updated";

    /// <summary>ISSUE-03 — a card link was replaced, revoking every copy of the old one.</summary>
    public const string CardReissued = "registration.card_reissued";

    /// <summary>BUG-12 — a membership's end date moved onto the current term.</summary>
    public const string TermRealigned = "registration.term_realigned";

    public const string AttachmentAdded = "registration.attachment_added";
    public const string AttachmentRemoved = "registration.attachment_removed";
    public const string PermissionDenied = "registration.permission_denied";

    public const string UserCreated = "admin_user.created";
    public const string UserUpdated = "admin_user.updated";
    public const string UserPasswordReset = "admin_user.password_reset";
    public const string RoleCreated = "admin_role.created";
    public const string RoleUpdated = "admin_role.updated";
    public const string RoleDeleted = "admin_role.deleted";

    public const string ContentUpdated = "content.updated";
    public const string ContentReset = "content.reset";
    public const string MediaUploaded = "media.uploaded";

    public const string NewsCreated = "news.created";
    public const string NewsUpdated = "news.updated";
    public const string NewsDeleted = "news.deleted";
    public const string EventCreated = "event.created";
    public const string EventUpdated = "event.updated";
    public const string EventDeleted = "event.deleted";

    /// <summary>A rejected or cancelled request put back into review.</summary>
    public const string Reopened = "registration.reopened";

    public const string PasswordResetRequested = "admin_user.password_reset_requested";
    public const string PasswordResetCompleted = "admin_user.password_reset_completed";
}
