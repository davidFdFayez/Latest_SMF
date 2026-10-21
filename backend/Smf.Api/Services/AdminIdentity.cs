using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Reads the acting administrator and what they may do.
///
/// Permissions are resolved from the database on every authenticated request
/// (<see cref="OnTokenValidatedAsync"/>) rather than baked into the token.
/// Roles are editable from the console, so a token that carried its grants
/// would keep a removed permission — or a deactivated account — working until
/// it expired eight hours later.
/// </summary>
public static class AdminIdentity
{
    /// <summary>Authentication type of the identity this class attaches; claims are only trusted from it.</summary>
    private const string AccessIdentityType = "SmfAdminAccess";
    private const string PermissionClaim = "perm";

    /// <summary>Marks which password a token was issued under; see <see cref="Data.Models.AdminUser.SecurityStamp"/>.</summary>
    public const string SecurityStampClaim = "stamp";
    private const string RolesClaim = "adminRoles";

    /// <param name="Id">Admin user id, or null when the token carries no usable subject.</param>
    /// <param name="Username">Username, or "unknown" — never null, so the audit trail always names someone.</param>
    /// <param name="RoleKeys">The actor's role keys, comma-separated, for the audit trail.</param>
    /// <param name="Permissions">Effective permissions — the union of every role held.</param>
    public record Actor(int? Id, string Username, string? RoleKeys, IReadOnlySet<string> Permissions)
    {
        public bool Has(string permission) => AdminPermissions.Grants(Permissions, permission);

        /// <summary>Whether this actor may perform a §6 membership action.</summary>
        public bool Can(string action) => Has(AdminPermissions.ForMembershipAction(action));

        /// <summary>The §6 actions available to this actor.</summary>
        public string[] Grants => MembershipRoles.Actions.All.Where(Can).ToArray();
    }

    /// <summary>A user with their roles and effective permissions, as stored right now.</summary>
    public record Access(AdminUser User, IReadOnlyList<AdminRole> Roles, IReadOnlySet<string> Permissions);

    public static Actor Current(ClaimsPrincipal? user)
    {
        if (user is null) return new Actor(null, "unknown", null, new HashSet<string>());

        var id = int.TryParse(Find(user, ClaimTypes.NameIdentifier, "sub"), out var parsed)
            ? parsed
            : (int?)null;

        var username = Find(user, ClaimTypes.Name, "unique_name", "preferred_username")
            ?? "unknown";

        // Only the identity attached below is trusted for grants. Anything else
        // on the principal came from the token, and tokens carry no permissions.
        var access = user.Identities.FirstOrDefault(i => i.AuthenticationType == AccessIdentityType);
        var permissions = access?.FindAll(PermissionClaim).Select(c => c.Value).ToHashSet()
                          ?? [];

        return new Actor(id, username, access?.FindFirst(RolesClaim)?.Value, permissions);
    }

    public static async Task<Access?> LoadAsync(SmfDbContext db, int userId, CancellationToken cancellationToken = default)
    {
        var user = await db.AdminUsers.AsNoTracking()
            .Include(u => u.Roles).ThenInclude(ur => ur.Role).ThenInclude(r => r!.Permissions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken);

        if (user is null) return null;

        var roles = user.Roles
            .Select(ur => ur.Role!)
            .OrderBy(r => r.NameEn)
            .ToList();

        var permissions = roles
            .SelectMany(r => r.Permissions)
            .Select(p => p.Permission)
            .ToHashSet();

        return new Access(user, roles, permissions);
    }

    /// <summary>
    /// JWT bearer hook: refuses tokens for accounts that no longer exist or have
    /// been deactivated, and attaches the account's current permissions.
    /// </summary>
    public static async Task OnTokenValidatedAsync(TokenValidatedContext context)
    {
        var principal = context.Principal;
        if (principal is null || !int.TryParse(Find(principal, ClaimTypes.NameIdentifier, "sub"), out var id))
        {
            context.Fail("The token does not identify an admin account.");
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<SmfDbContext>();
        var access = await LoadAsync(db, id, context.HttpContext.RequestAborted);

        if (access is null || !access.User.IsActive)
        {
            context.Fail("The admin account no longer exists or has been deactivated.");
            return;
        }

        // A password reset rotates the stamp, so anything issued before it
        // stops working the moment the new password is set.
        if (principal.FindFirstValue(SecurityStampClaim) != access.User.SecurityStamp)
        {
            context.Fail("The password for this account has changed; sign in again.");
            return;
        }

        var identity = new ClaimsIdentity(AccessIdentityType);
        foreach (var permission in access.Permissions)
            identity.AddClaim(new Claim(PermissionClaim, permission));
        identity.AddClaim(new Claim(RolesClaim, string.Join(",", access.Roles.Select(r => r.Key))));

        principal.AddIdentity(identity);
    }

    /// <summary>
    /// First non-empty value among the given claim types. JWT claim names are
    /// remapped inconsistently depending on handler configuration, so both the
    /// short ("sub") and mapped (ClaimTypes.NameIdentifier) forms are tried.
    /// </summary>
    private static string? Find(ClaimsPrincipal user, params string[] types)
    {
        foreach (var type in types)
        {
            var value = user.FindFirstValue(type);
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }

        return null;
    }
}
