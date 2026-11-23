using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The Admin Notification Center (the bell). Every signed-in administrator may call it, and sees only the
/// notifications one of their CURRENT permissions grants; read state is their own.
/// </summary>
public static class NotificationCenterEndpoints
{
    public static void MapNotificationCenter(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/notification-center");

        group.MapGet("", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var actor = AdminIdentity.Current(user);
            if (actor.Id is not { } me) return Results.Unauthorized();
            var visible = await VisibleAsync(db, actor, ct);
            var reads = await db.AdminNotificationReads.AsNoTracking()
                .Where(r => r.AdminUserId == me).ToDictionaryAsync(r => r.NotificationId, r => r.ReadAt, ct);
            var items = visible.OrderByDescending(n => n.UpdatedAt).ThenByDescending(n => n.Id).Take(100).Select(n => new
            {
                n.Id, n.Type, n.Title, n.Message, n.Link, n.TournamentId, n.CreatedAt, n.UpdatedAt,
                read = reads.ContainsKey(n.Id), readAt = reads.TryGetValue(n.Id, out var at) ? at : (DateTime?)null,
                resolved = n.ResolvedAt is not null, n.ResolvedAt, n.ResolvedNote,
            }).ToList();
            return Results.Ok(new { unread = items.Count(i => !i.read), items });
        });

        group.MapGet("/unread-count", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var actor = AdminIdentity.Current(user);
            if (actor.Id is not { } me) return Results.Unauthorized();
            var ids = (await VisibleAsync(db, actor, ct)).Select(n => n.Id).ToList();
            var read = await db.AdminNotificationReads.CountAsync(r => r.AdminUserId == me && ids.Contains(r.NotificationId), ct);
            return Results.Ok(new { unread = ids.Count - read });
        });

        group.MapPost("/{id:int}/read", async (int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var actor = AdminIdentity.Current(user);
            if (actor.Id is not { } me) return Results.Unauthorized();
            if (!(await VisibleAsync(db, actor, ct)).Any(n => n.Id == id)) return Results.NotFound();
            await MarkReadAsync(db, me, [id], ct);
            return Results.Ok(new { read = id });
        });

        group.MapPost("/read-all", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var actor = AdminIdentity.Current(user);
            if (actor.Id is not { } me) return Results.Unauthorized();
            var ids = (await VisibleAsync(db, actor, ct)).Select(n => n.Id).ToList();
            await MarkReadAsync(db, me, ids, ct);
            return Results.Ok(new { read = ids.Count });
        });
    }

    /// <summary>The notifications this administrator's current permissions grant.</summary>
    private static async Task<List<AdminNotification>> VisibleAsync(SmfDbContext db, AdminIdentity.Actor actor, CancellationToken ct) =>
        (await db.AdminNotifications.AsNoTracking().ToListAsync(ct))
            .Where(n => n.Permissions.Split(',', StringSplitOptions.RemoveEmptyEntries).Any(actor.Has))
            .ToList();

    private static async Task MarkReadAsync(SmfDbContext db, int adminUserId, IReadOnlyCollection<int> ids, CancellationToken ct)
    {
        var already = await db.AdminNotificationReads.Where(r => r.AdminUserId == adminUserId && ids.Contains(r.NotificationId))
            .Select(r => r.NotificationId).ToListAsync(ct);
        foreach (var id in ids.Except(already))
            db.AdminNotificationReads.Add(new AdminNotificationRead { NotificationId = id, AdminUserId = adminUserId, ReadAt = DateTime.UtcNow });
        await db.SaveChangesAsync(ct);
    }
}
