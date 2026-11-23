using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Writing notices to members' notification bells. The caller saves, so a
/// notice is stored in the same transaction as the event it reports — an
/// accepted invitation and the club's "accepted" notice land together or not
/// at all.
/// </summary>
public static class MemberNotifications
{
    public sealed record Text(string Ar, string En);

    public static void Add(
        SmfDbContext db,
        int memberAccountId,
        string type,
        Text title,
        Text body,
        string? target = null,
        int? relatedId = null)
    {
        db.MemberNotifications.Add(new MemberNotification
        {
            MemberAccountId = memberAccountId,
            Type = type,
            TitleAr = title.Ar,
            TitleEn = title.En,
            BodyAr = body.Ar,
            BodyEn = body.En,
            Target = target,
            RelatedId = relatedId,
        });
    }

    /// <summary>The accounts that speak for a club: who a notice to "the club" goes to.</summary>
    public static Task<List<int>> ClubAccountIdsAsync(SmfDbContext db, int clubRegistrationId, CancellationToken ct) =>
        db.MemberAccounts.AsNoTracking()
            .Where(a => a.RegistrationId == clubRegistrationId && a.Kind == MemberAccountKinds.Club && a.IsActive)
            .Select(a => a.Id)
            .ToListAsync(ct);
}
