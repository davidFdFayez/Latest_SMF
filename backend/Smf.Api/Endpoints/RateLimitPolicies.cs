namespace Smf.Api.Endpoints;

/// <summary>Named rate-limiting policies, shared between Program and the endpoint maps.</summary>
public static class RateLimitPolicies
{
    /// <summary>Public, unauthenticated registration writes (submit + document upload).</summary>
    public const string PublicRegistration = "public-registration";
}
