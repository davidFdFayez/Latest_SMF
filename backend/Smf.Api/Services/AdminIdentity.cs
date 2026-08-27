using System.Security.Claims;
using Smf.Api.Data;

namespace Smf.Api.Services;

/// <summary>
/// Reads the acting administrator out of the bearer token.
///
/// Every §6 permission check and every audit entry needs to know who is
/// calling, so the claim names are resolved in exactly one place rather than
/// being restated at each endpoint.
/// </summary>
public static class AdminIdentity
{
    /// <param name="Id">Admin user id, or null when the token carries no usable subject.</param>
    /// <param name="Username">Username, or "unknown" — never null, so the audit trail always names someone.</param>
    /// <param name="Role">Site-area role (<see cref="AdminRoles"/>).</param>
    /// <param name="MembershipRole">Membership-register role (<see cref="MembershipRoles"/>), or null.</param>
    public record Actor(int? Id, string Username, string? Role, string? MembershipRole)
    {
        /// <summary>Whether this actor may perform a §6 action.</summary>
        public bool Can(string action) => MembershipRoles.Can(MembershipRole, Role, action);

        /// <summary>The §6 actions available to this actor.</summary>
        public string[] Grants => MembershipRoles.GrantsFor(MembershipRole, Role);
    }

    public static Actor Current(ClaimsPrincipal? user)
    {
        if (user is null) return new Actor(null, "unknown", null, null);

        var id = int.TryParse(Find(user, ClaimTypes.NameIdentifier, "sub"), out var parsed)
            ? parsed
            : (int?)null;

        var username = Find(user, ClaimTypes.Name, "unique_name", "preferred_username")
            ?? "unknown";

        return new Actor(
            id,
            username,
            Find(user, ClaimTypes.Role, "role"),
            Find(user, "membershipRole"));
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
