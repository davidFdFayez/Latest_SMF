using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;
using Text = Smf.Api.Services.MemberNotifications.Text;

namespace Smf.Api.Endpoints;

/// <summary>
/// A club's invitations to coaches and athletes, and their answer.
///
/// The club asks; only the member's acceptance links them to the club. Every
/// rule is checked here against the signed-in account — which invitation is
/// whose comes from the database, never from what the request claims.
/// </summary>
public static class MemberInvitationEndpoints
{
    private const string ClubRequests = "/account/club?section=requests";

    /// <summary>Where a coach or an athlete answers an invitation.</summary>
    private static string RequestsOf(string kind) => kind == MemberAccountKinds.Athlete
        ? "/account/athlete?section=requests"
        : "/account/coach?section=requests";

    /// <summary>The role the club asks them to join as, in both languages.</summary>
    private static (string Ar, string En) RoleOf(string kind) => kind == MemberAccountKinds.Athlete
        ? ("كلاعب", "as a player")
        : ("كمدرب", "as a coach");

    /// <summary>
    /// A club invites a coach or an athlete: a pending invitation, and a notice
    /// to them. An invitation already pending from this club is reused, not repeated.
    /// </summary>
    public static async Task<ClubInvitation> InviteMemberAsync(
        SmfDbContext db, Registration club, MemberAccount member, string invitedBy, CancellationToken ct)
    {
        var existing = await db.ClubInvitations.FirstOrDefaultAsync(i =>
            i.ClubRegistrationId == club.Id && i.MemberAccountId == member.Id
            && i.Status == ClubInvitationStatuses.Pending, ct);
        if (existing is not null) return existing;

        var invitation = new ClubInvitation
        {
            ClubRegistrationId = club.Id,
            MemberAccountId = member.Id,
            Kind = member.Kind,
            InvitedBy = invitedBy,
        };
        db.ClubInvitations.Add(invitation);
        await db.SaveChangesAsync(ct);

        var clubAr = MemberEndpoints.NameOf(club, true) ?? club.ReferenceNumber;
        var clubEn = MemberEndpoints.NameOf(club, false) ?? club.ReferenceNumber;
        var role = RoleOf(member.Kind);
        MemberNotifications.Add(db, member.Id, MemberNotificationTypes.ClubInvitationReceived,
            new Text("دعوة للانضمام إلى نادٍ", "Invitation to join a club"),
            new Text($"{clubAr} أرسل لك دعوة للانضمام إلى النادي {role.Ar}.", $"{clubEn} invited you to join the club {role.En}."),
            RequestsOf(member.Kind), invitation.Id);
        await db.SaveChangesAsync(ct);

        return invitation;
    }

    public static void MapMemberInvitations(this RouteGroupBuilder group)
    {
        /// The invitations that concern the signed-in account: those a club
        /// sent, or those a coach or an athlete received. Nobody else's.
        group.MapGet("/invitations", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            var query = db.ClubInvitations.AsNoTracking().Include(i => i.MemberAccount!).ThenInclude(a => a.Registration);
            List<ClubInvitation> invitations = holder.IsClub
                ? await query.Where(i => i.ClubRegistrationId == holder.RegistrationId).ToListAsync(ct)
                : holder.IsCoach || holder.IsAthlete
                    ? await query.Where(i => i.MemberAccountId == holder.AccountId).ToListAsync(ct)
                    : [];

            var clubIds = invitations.Select(i => i.ClubRegistrationId).Distinct().ToList();
            var clubs = await db.Registrations.AsNoTracking()
                .Where(r => clubIds.Contains(r.Id))
                .ToDictionaryAsync(r => r.Id, ct);

            return Results.Ok(invitations
                .OrderByDescending(i => i.CreatedAt)
                .Select(i =>
                {
                    var club = clubs.GetValueOrDefault(i.ClubRegistrationId);
                    var person = i.MemberAccount?.Registration;
                    return new
                    {
                        i.Id,
                        i.Kind,
                        i.Status,
                        i.CreatedAt,
                        i.RespondedAt,
                        club = club is null ? null : new
                        {
                            nameAr = MemberEndpoints.NameOf(club, true),
                            nameEn = MemberEndpoints.NameOf(club, false),
                            logoUrl = MemberEndpoints.PhotoUrl(club),
                        },
                        // The club sees who it invited; the invitee already knows.
                        invitee = holder.IsClub ? new
                        {
                            email = i.MemberAccount?.Email,
                            nameAr = person is null ? null : MemberEndpoints.NameOf(person, true),
                            nameEn = person is null ? null : MemberEndpoints.NameOf(person, false),
                            photoUrl = MemberEndpoints.PhotoUrl(person),
                        } : null,
                    };
                }));
        });

        /// The coach or athlete accepts: only now are they the club's.
        group.MapPost("/invitations/{id:int}/accept", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var (invitation, refusal) = await OwnPendingAsync(db, holder, id, ct);
            if (refusal is not null) return refusal;

            var member = await db.MemberAccounts.FirstAsync(a => a.Id == holder.AccountId, ct);

            // One club at a time: that is the model. Joining another means
            // leaving the first, which is not something an invitation does.
            if (member.ClubRegistrationId is { } current && current != invitation!.ClubRegistrationId)
            {
                return Refuse(409,
                    "أنت مرتبط بنادٍ آخر حاليًا، ولا يمكن الانضمام إلى أكثر من نادٍ.",
                    "You are already linked to another club, and a member belongs to one club at a time.");
            }

            await using var transaction = await db.Database.BeginTransactionAsync(ct);

            invitation!.Status = ClubInvitationStatuses.Accepted;
            invitation.RespondedAt = DateTime.UtcNow;
            member.ClubRegistrationId = invitation.ClubRegistrationId;

            await NotifyClubAsync(db, invitation, member, accepted: true, ct);
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);

            return Results.Ok(new { invitation.Id, invitation.Status });
        });

        /// The coach or athlete declines: nothing is linked.
        group.MapPost("/invitations/{id:int}/reject", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var (invitation, refusal) = await OwnPendingAsync(db, holder, id, ct);
            if (refusal is not null) return refusal;

            var member = await db.MemberAccounts.FirstAsync(a => a.Id == holder.AccountId, ct);

            invitation!.Status = ClubInvitationStatuses.Rejected;
            invitation.RespondedAt = DateTime.UtcNow;

            await NotifyClubAsync(db, invitation, member, accepted: false, ct);
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { invitation.Id, invitation.Status });
        });

        /// The club withdraws an invitation not yet answered.
        group.MapPost("/invitations/{id:int}/cancel", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsClub) return Results.Forbid();

            var invitation = await db.ClubInvitations
                .FirstOrDefaultAsync(i => i.Id == id && i.ClubRegistrationId == holder.RegistrationId, ct);
            if (invitation is null) return Results.NotFound();

            if (invitation.Status != ClubInvitationStatuses.Pending)
                return Refuse(409, "لم تعد هذه الدعوة قيد الانتظار.", "This invitation is no longer pending.");

            invitation.Status = ClubInvitationStatuses.Cancelled;
            invitation.RespondedAt = DateTime.UtcNow;

            var club = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            var clubAr = club is null ? "النادي" : MemberEndpoints.NameOf(club, true) ?? "النادي";
            var clubEn = club is null ? "The club" : MemberEndpoints.NameOf(club, false) ?? "The club";
            var role = RoleOf(invitation.Kind);
            MemberNotifications.Add(db, invitation.MemberAccountId, MemberNotificationTypes.ClubInvitationCancelled,
                new Text("أُلغيت دعوة نادٍ", "A club invitation was cancelled"),
                new Text($"ألغى {clubAr} دعوته لك للانضمام {role.Ar}.", $"{clubEn} cancelled its invitation for you to join {role.En}."),
                RequestsOf(invitation.Kind), invitation.Id);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { invitation.Id, invitation.Status });
        });
    }

    /// <summary>
    /// The signed-in coach's or athlete's own invitation, still open to an answer — or the
    /// reason it is not: someone else's reads as not found, an answered one
    /// as a conflict.
    /// </summary>
    private static async Task<(ClubInvitation? Invitation, IResult? Refusal)> OwnPendingAsync(
        SmfDbContext db, MemberIdentity.Holder holder, int id, CancellationToken ct)
    {
        if (!holder.IsCoach && !holder.IsAthlete) return (null, Results.Forbid());

        var invitation = await db.ClubInvitations
            .FirstOrDefaultAsync(i => i.Id == id && i.MemberAccountId == holder.AccountId, ct);
        if (invitation is null) return (null, Results.NotFound());

        if (invitation.Status != ClubInvitationStatuses.Pending)
        {
            return (null, Refuse(409,
                invitation.Status == ClubInvitationStatuses.Cancelled
                    ? "ألغى النادي هذه الدعوة."
                    : "تم الرد على هذه الدعوة مسبقًا.",
                invitation.Status == ClubInvitationStatuses.Cancelled
                    ? "The club cancelled this invitation."
                    : "This invitation has already been answered."));
        }

        return (invitation, null);
    }

    private static async Task NotifyClubAsync(
        SmfDbContext db, ClubInvitation invitation, MemberAccount member, bool accepted, CancellationToken ct)
    {
        var person = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == member.RegistrationId, ct);
        var nameAr = (person is null ? null : MemberEndpoints.NameOf(person, true)) ?? member.Email;
        var nameEn = (person is null ? null : MemberEndpoints.NameOf(person, false)) ?? member.Email;
        var athlete = member.Kind == MemberAccountKinds.Athlete;

        foreach (var clubAccountId in await MemberNotifications.ClubAccountIdsAsync(db, invitation.ClubRegistrationId, ct))
        {
            MemberNotifications.Add(db, clubAccountId,
                accepted ? MemberNotificationTypes.ClubInvitationAccepted : MemberNotificationTypes.ClubInvitationRejected,
                athlete
                    ? accepted ? new Text("قبول دعوة لاعب", "Player invitation accepted") : new Text("رفض دعوة لاعب", "Player invitation declined")
                    : accepted ? new Text("قبول دعوة مدرب", "Coach invitation accepted") : new Text("رفض دعوة مدرب", "Coach invitation declined"),
                accepted
                    ? new Text($"قبل {nameAr} دعوتك للانضمام إلى النادي.", $"{nameEn} accepted your invitation to join the club.")
                    : new Text($"اعتذر {nameAr} عن دعوتك للانضمام إلى النادي.", $"{nameEn} declined your invitation to join the club."),
                ClubRequests, invitation.Id);
        }
    }

    private static IResult Refuse(int status, string ar, string en) => Results.Json(new
    {
        message = $"{ar} / {en}",
        messageAr = ar,
        messageEn = en,
    }, statusCode: status);
}
