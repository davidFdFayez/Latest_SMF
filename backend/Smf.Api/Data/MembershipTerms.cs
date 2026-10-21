namespace Smf.Api.Data;

/// <summary>
/// How long a membership lasts, per track.
///
/// One year for every track — athlete, coach, referee, and club.
///
/// The Phase 2 document read "مدة العضوية / الرخصة: 3 سنوات"; the federation
/// corrected that to a single year for all categories in tracker item BUG-12,
/// and that correction is the default here.
///
/// It is read from configuration so a change the federation approves later is
/// a setting rather than a code change:
///
///   Membership:TermYears:default   → all tracks
///   Membership:TermYears:official  → one track (athlete | coach | official | club)
/// </summary>
public static class MembershipTerms
{
    /// <summary>Longest term a configuration value may set, as a guard against typos.</summary>
    private const int MaxYears = 25;

    public static int YearsFor(string? type, IConfiguration? configuration)
    {
        var configured = configuration?[$"Membership:TermYears:{type}"]
                         ?? configuration?["Membership:TermYears:default"];

        if (int.TryParse(configured, out var years) && years > 0 && years <= MaxYears)
            return years;

        return MembershipTracks.TermYears(type);
    }
}
