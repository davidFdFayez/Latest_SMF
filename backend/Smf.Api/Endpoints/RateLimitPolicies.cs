namespace Smf.Api.Endpoints;

/// <summary>Named rate-limiting policies, shared between Program and the endpoint maps.</summary>
public static class RateLimitPolicies
{
    /// <summary>Public, unauthenticated registration writes (submit + document upload).</summary>
    public const string PublicRegistration = "public-registration";

    /// <summary>Password-reset requests and attempts, so links cannot be farmed or guessed.</summary>
    public const string PasswordReset = "password-reset";

    /// <summary>
    /// Public membership-card reads. The token is unguessable, but a limit
    /// means the space cannot be swept even so, and one scanned card can still
    /// be re-read as often as a door official needs.
    /// </summary>
    public const string MembershipCard = "membership-card";

    /// <summary>
    /// Member sign-in and account activation.
    ///
    /// Separate from the password-reset limiter, which is deliberately tight
    /// because a reset emails a link. Signing in is the ordinary way thousands
    /// of clubs, coaches and athletes reach the portal — several of them may
    /// share one club's network address — so the brake here is on credential
    /// stuffing rather than on normal use.
    /// </summary>
    public const string MemberAuth = "member-auth";
}
