using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The console's side of member accounts — Phase 3 REQ-05, REQ-06, REQ-07.
///
/// The federation creates the first club accounts (a club cannot invite
/// itself), sees every account, and reviews the changes account holders
/// propose.
/// </summary>
public static class MemberAccountAdminEndpoints
{
    public static void MapMemberAccountsAdmin(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/member-accounts").WithTags("Member accounts");

        group.MapGet("/", async (
            string? kind, string? search, SmfDbContext db, CancellationToken ct) =>
        {
            var query = db.MemberAccounts.AsNoTracking().Include(a => a.Registration).AsQueryable();
            if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(a => a.Kind == kind);

            var accounts = await query.OrderByDescending(a => a.CreatedAt).ToListAsync(ct);

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                accounts = accounts.Where(a =>
                    a.Email.Contains(term, StringComparison.OrdinalIgnoreCase)
                    || (a.DisplayName ?? string.Empty).Contains(term, StringComparison.OrdinalIgnoreCase)
                    || (a.Registration?.MembershipNumber ?? string.Empty).Contains(term, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            return Results.Ok(accounts.Select(Describe));
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.TournamentEntries,
            AdminPermissions.TournamentManage);

        /// Creating the first account for a club, coach or athlete. A club
        /// cannot invite itself, so this is where that starts.
        group.MapPost("/invite", async (
            AdminInviteRequest request, ClaimsPrincipal user,
            MemberAccountService accounts, CancellationToken ct) =>
        {
            var actor = AdminIdentity.Current(user);

            var (result, invite) = await accounts.InviteAsync(
                request.Email ?? string.Empty,
                request.Kind ?? MemberAccountKinds.Club,
                request.RegistrationId,
                request.ClubRegistrationId,
                request.DisplayName,
                invitedBy: actor.Username,
                ct);

            return result.Ok
                ? Results.Ok(new
                {
                    invite!.Account.Id,
                    invite.Account.Email,
                    invite.AlreadyExisted,
                    invite.Account.IsPending,
                    invite.Delivered,
                    // Only when nobody received it. An invitation that arrived
                    // belongs in its recipient's inbox and nowhere else.
                    activationLink = invite.Delivered ? null : invite.Link,
                })
                : Problem(result);
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.TournamentEntries);

        group.MapPost("/{accountId:int}/resend", async (
            int accountId, ClaimsPrincipal user, SmfDbContext db,
            MemberAccountService accounts, CancellationToken ct) =>
        {
            var account = await db.MemberAccounts.FirstOrDefaultAsync(a => a.Id == accountId, ct);
            if (account is null) return Results.NotFound();

            if (!account.IsPending)
            {
                return Results.Json(new
                {
                    message = "الحساب مفعّل بالفعل. / That account is already active.",
                    messageAr = "الحساب مفعّل بالفعل.",
                    messageEn = "That account is already active.",
                }, statusCode: StatusCodes.Status409Conflict);
            }

            var actor = AdminIdentity.Current(user);
            var (result, invite) = await accounts.InviteAsync(
                account.Email, account.Kind, account.RegistrationId,
                account.ClubRegistrationId, account.DisplayName, actor.Username, ct);

            return result.Ok
                ? Results.Ok(new
                {
                    resent = true,
                    delivered = invite?.Delivered ?? false,
                    activationLink = invite is { Delivered: false } ? invite.Link : null,
                })
                : Problem(result);
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.TournamentEntries);

        /// A fresh activation link, for an account that says it never got one.
        ///
        /// Only the hash of an invitation is kept, so the live link cannot be
        /// looked up — it has to be reissued, which retires the old one. The
        /// link is the account, so this needs the permission that manages
        /// users rather than the one that runs entries, and every use is
        /// written to the audit log.
        group.MapPost("/{accountId:int}/invite-link", async (
            int accountId, ClaimsPrincipal user, SmfDbContext db,
            MemberAccountService accounts, CancellationToken ct) =>
        {
            var account = await db.MemberAccounts.FirstOrDefaultAsync(a => a.Id == accountId, ct);
            if (account is null) return Results.NotFound();

            var (result, link) = await accounts.ReissueAsync(account, AdminIdentity.Current(user), ct);

            return result.Ok
                ? Results.Ok(new { account.Id, account.Email, activationLink = link })
                : Problem(result);
        }).RequirePermission(AdminPermissions.Users);

        group.MapPost("/{accountId:int}/active", async (
            int accountId, ActiveRequest request, ClaimsPrincipal user,
            SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var account = await db.MemberAccounts.FirstOrDefaultAsync(a => a.Id == accountId, ct);
            if (account is null) return Results.NotFound();

            account.IsActive = request.IsActive;
            // Turning an account off ends its open sessions immediately.
            if (!request.IsActive) account.SecurityStamp = Guid.NewGuid().ToString("N");

            audit.Write(AdminIdentity.Current(user), AuditActions.MemberAccountUpdated, "member_account", account.Id,
                account.Email, toStatus: request.IsActive ? "active" : "inactive");

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { account.Id, account.IsActive });
        }).RequirePermission(AdminPermissions.Users);

        /* ── changes proposed from a portal ─────────────────────────────── */

        group.MapGet("/changes", async (string? status, SmfDbContext db, CancellationToken ct) =>
        {
            var query = db.MemberProfileChanges.AsNoTracking()
                .Include(c => c.MemberAccount)
                .AsQueryable();

            query = string.IsNullOrWhiteSpace(status)
                ? query.Where(c => c.Status == ProfileChangeStatuses.Pending)
                : query.Where(c => c.Status == status);

            var changes = await query.OrderByDescending(c => c.CreatedAt).ToListAsync(ct);

            return Results.Ok(changes.Select(c => new
            {
                c.Id,
                c.Status,
                c.CreatedAt,
                c.ReviewedAt,
                c.ReviewedBy,
                c.ReviewNote,
                account = c.MemberAccount is null ? null : new
                {
                    c.MemberAccount.Id,
                    c.MemberAccount.Email,
                    c.MemberAccount.Kind,
                },
                c.RegistrationId,
                changes = Read(c.ChangesJson),
            }));
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.TournamentEntries,
            AdminPermissions.ForMembershipAction(MembershipRoles.Actions.Edit));

        group.MapPost("/changes/{changeId:int}/review", async (
            int changeId, ReviewChangeRequest request, ClaimsPrincipal user,
            SmfDbContext db, MemberAccountService accounts, CancellationToken ct) =>
        {
            var change = await db.MemberProfileChanges.FirstOrDefaultAsync(c => c.Id == changeId, ct);
            if (change is null) return Results.NotFound();

            var result = await accounts.ReviewChangeAsync(
                change, request.Approve, request.Note, AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { change.Id, change.Status }) : Problem(result);
        }).RequirePermission(AdminPermissions.ForMembershipAction(MembershipRoles.Actions.Edit),
            AdminPermissions.Users);
    }

    private static object Describe(MemberAccount a) => new
    {
        a.Id,
        a.Email,
        a.Kind,
        kindAr = MemberAccountKinds.Label(a.Kind).Ar,
        kindEn = MemberAccountKinds.Label(a.Kind).En,
        a.DisplayName,
        a.RegistrationId,
        a.ClubRegistrationId,
        membershipNumber = a.Registration?.MembershipNumber,
        membershipStatus = a.Registration?.Status,
        a.IsActive,
        a.IsPending,
        a.InviteSentAt,
        a.InviteExpiresAt,
        a.ActivatedAt,
        a.LastLoginAt,
        a.InvitedBy,
        a.CreatedAt,
    };

    private static Dictionary<string, string> Read(string json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IResult Problem(TournamentService.Outcome outcome) => Results.Json(new
    {
        message = $"{outcome.MessageAr} / {outcome.MessageEn}",
        messageAr = outcome.MessageAr,
        messageEn = outcome.MessageEn,
    }, statusCode: outcome.Status);
}

public record AdminInviteRequest(
    string? Email, string? Kind, int RegistrationId, int? ClubRegistrationId, string? DisplayName);

public record ActiveRequest(bool IsActive);
public record ReviewChangeRequest(bool Approve, string? Note);
