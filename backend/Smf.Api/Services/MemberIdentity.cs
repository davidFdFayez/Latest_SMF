using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Who a signed-in club, coach or athlete is — Phase 3 REQ-05, REQ-06, REQ-07.
///
/// A deliberately separate scheme from the console's. The two use different
/// audiences, so a member's token is not merely unauthorised on an admin
/// endpoint — it fails validation there outright, and no amount of editing
/// roles can change that. For thousands of public accounts standing beside a
/// federation back office, that separation should be structural.
/// </summary>
public static class MemberIdentity
{
    /// <summary>The scheme member endpoints authenticate against.</summary>
    public const string Scheme = "MemberBearer";

    /// <summary>The authorization policy member endpoints require.</summary>
    public const string Policy = "MemberOnly";

    public const string KindClaim = "member_kind";
    public const string RegistrationClaim = "member_registration";
    public const string ClubClaim = "member_club";
    public const string StampClaim = "member_stamp";

    /// <summary>The audience that marks a token as a member's rather than an administrator's.</summary>
    public const string Audience = "Smf.Members";

    public sealed record Holder(
        int AccountId,
        string Email,
        string Kind,
        int RegistrationId,
        int? ClubRegistrationId)
    {
        public bool IsClub => Kind == MemberAccountKinds.Club;
        public bool IsCoach => Kind == MemberAccountKinds.Coach;
        public bool IsAthlete => Kind == MemberAccountKinds.Athlete;

        /// <summary>
        /// The club whose athletes this holder may see: their own record if
        /// they are a club, the club they are attached to if they are a coach.
        /// </summary>
        public int? ClubScope => IsClub ? RegistrationId : ClubRegistrationId;
    }

    public static Holder Current(ClaimsPrincipal principal) => new(
        int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : 0,
        principal.FindFirstValue(ClaimTypes.Email) ?? string.Empty,
        principal.FindFirstValue(KindClaim) ?? string.Empty,
        int.TryParse(principal.FindFirstValue(RegistrationClaim), out var registration) ? registration : 0,
        int.TryParse(principal.FindFirstValue(ClubClaim), out var club) ? club : null);

    /// <summary>
    /// Re-reads the account on every request, exactly as the console does, so
    /// that deactivating an account or changing its password takes effect at
    /// once rather than whenever the token happens to expire.
    /// </summary>
    public static async Task OnTokenValidatedAsync(TokenValidatedContext context)
    {
        var principal = context.Principal;
        if (principal is null)
        {
            context.Fail("No principal.");
            return;
        }

        if (!int.TryParse(principal.FindFirstValue(ClaimTypes.NameIdentifier), out var accountId))
        {
            context.Fail("No account.");
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<SmfDbContext>();

        var account = await db.MemberAccounts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == accountId, context.HttpContext.RequestAborted);

        if (account is null || !account.CanSignIn)
        {
            context.Fail("This account can no longer sign in.");
            return;
        }

        if (principal.FindFirstValue(StampClaim) != account.SecurityStamp)
        {
            context.Fail("This session is no longer valid.");
            return;
        }

        // The membership behind the account has to still be live: an expired
        // or suspended membership should not keep a portal open.
        var registration = await db.Registrations
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == account.RegistrationId, context.HttpContext.RequestAborted);

        if (registration is null)
        {
            context.Fail("The membership behind this account is gone.");
            return;
        }

        // Claims are refreshed rather than trusted from the token, so a coach
        // moved between clubs is in the right place on their next request.
        var identity = (ClaimsIdentity)principal.Identity!;
        Replace(identity, ClubClaim, account.ClubRegistrationId?.ToString());
        Replace(identity, KindClaim, account.Kind);
        Replace(identity, RegistrationClaim, account.RegistrationId.ToString());
    }

    private static void Replace(ClaimsIdentity identity, string type, string? value)
    {
        foreach (var existing in identity.FindAll(type).ToList()) identity.RemoveClaim(existing);
        if (!string.IsNullOrEmpty(value)) identity.AddClaim(new Claim(type, value));
    }
}
