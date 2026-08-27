using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Appends to the audit trail (Phase 1 compliance case P6; §6 of the Phase 2
/// workflow document).
///
/// Entries are queued on the same <see cref="SmfDbContext"/> as the change they
/// describe and saved with it, so a decision and its audit record commit
/// together — an approval can never land without the entry that says who made
/// it. Callers therefore do not save on the logger's behalf.
/// </summary>
public class AuditLogger(SmfDbContext db)
{
    /// <summary>Records an action against a registration.</summary>
    public AuditLogEntry Registration(
        AdminIdentity.Actor actor,
        string action,
        Registration registration,
        string? fromStatus = null,
        string? toStatus = null,
        string? details = null)
    {
        return Write(
            actor,
            action,
            "registration",
            registration.Id,
            registration.ReferenceNumber,
            fromStatus,
            toStatus,
            details);
    }

    public AuditLogEntry Write(
        AdminIdentity.Actor actor,
        string action,
        string entityType,
        int entityId,
        string? entityRef = null,
        string? fromStatus = null,
        string? toStatus = null,
        string? details = null)
    {
        var entry = new AuditLogEntry
        {
            ActorId = actor.Id,
            ActorName = actor.Username,
            ActorRole = actor.MembershipRole ?? actor.Role,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            EntityRef = entityRef,
            FromStatus = fromStatus,
            ToStatus = toStatus,
            Details = Truncate(details),
            CreatedAt = DateTime.UtcNow,
        };

        db.AuditLog.Add(entry);
        return entry;
    }

    /// <summary>
    /// A refused action is worth recording too: repeated denials against the
    /// register are exactly the pattern an audit is meant to surface. Saved
    /// immediately, because the request it belongs to is about to be rejected
    /// and nothing else will commit.
    /// </summary>
    public async Task DeniedAsync(
        AdminIdentity.Actor actor,
        string attemptedAction,
        string entityType,
        int entityId,
        CancellationToken cancellationToken = default)
    {
        Write(
            actor,
            AuditActions.PermissionDenied,
            entityType,
            entityId,
            details: $"Attempted: {attemptedAction}");

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>Reasons are free text from reviewers; the column is not a document store.</summary>
    private static string? Truncate(string? value) =>
        value is { Length: > 2000 } ? value[..2000] : value;
}
