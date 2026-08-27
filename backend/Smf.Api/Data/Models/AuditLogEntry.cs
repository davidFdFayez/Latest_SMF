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

    /// <summary>The actor's membership role at the time of the action (§6).</summary>
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
    public const string PermissionDenied = "registration.permission_denied";
}
