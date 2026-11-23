using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The website's notification bell, for any signed-in member. Every query is
/// bounded by the signed-in account: there is no way to name someone else's.
/// </summary>
public static class MemberNotificationEndpoints
{
    private const int Recent = 20;

    public static void MapMemberNotifications(this RouteGroupBuilder group)
    {
        group.MapGet("/notifications", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var mine = db.MemberNotifications.AsNoTracking().Where(n => n.MemberAccountId == holder.AccountId);

            var unread = await mine.CountAsync(n => n.ReadAt == null, ct);
            var items = await mine.OrderByDescending(n => n.CreatedAt).ThenByDescending(n => n.Id)
                .Take(Recent)
                .Select(n => new
                {
                    n.Id,
                    n.Type,
                    n.TitleAr,
                    n.TitleEn,
                    n.BodyAr,
                    n.BodyEn,
                    n.Target,
                    n.CreatedAt,
                    read = n.ReadAt != null,
                })
                .ToListAsync(ct);

            return Results.Ok(new { unread, items });
        });

        group.MapPost("/notifications/{id:int}/read", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var notification = await db.MemberNotifications
                .FirstOrDefaultAsync(n => n.Id == id && n.MemberAccountId == holder.AccountId, ct);
            if (notification is null) return Results.NotFound();

            notification.ReadAt ??= DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { notification.Id, read = true });
        });

        group.MapPost("/notifications/read-all", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var now = DateTime.UtcNow;
            var marked = await db.MemberNotifications
                .Where(n => n.MemberAccountId == holder.AccountId && n.ReadAt == null)
                .ExecuteUpdateAsync(set => set.SetProperty(n => n.ReadAt, now), ct);
            return Results.Ok(new { marked });
        });
    }
}
