using System.Text.Json;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Beneficiary profiles — tracker ISSUE-03.
///
/// Until now a beneficiary existed only as the application form they once
/// filled in. That is the wrong unit: an athlete who re-applied after a
/// rejection, or whose club submitted a correction, is one person with several
/// applications, and a reviewer looking them up wants the person, not the
/// paperwork.
///
/// A profile groups every application that belongs to the same beneficiary and
/// presents the current one as their record, with the rest as history. It is
/// derived rather than stored: the registrations are still the source of truth,
/// so nothing can drift out of step with them and no migration is needed.
///
/// Identity is the national/residency/passport number for a person, and the
/// official email (failing that, the club's English name) for a club — the same
/// values the portal already refuses to let two live applications share.
/// </summary>
public static class MemberProfiles
{
    /// <summary>A beneficiary and every application they have made.</summary>
    public sealed record Profile(
        int Id,
        string Type,
        string IdentityKey,
        Registration Current,
        IReadOnlyList<Registration> History);

    /// <summary>
    /// Groups registrations into profiles, newest application first.
    ///
    /// The profile's id is the id of the most recent application, which is also
    /// the one whose details are shown. Renewals update an application in place
    /// rather than creating one, so that id is stable for as long as the
    /// beneficiary keeps renewing.
    /// </summary>
    public static List<Profile> From(IEnumerable<Registration> registrations)
    {
        var groups = new Dictionary<string, List<Registration>>(StringComparer.OrdinalIgnoreCase);

        foreach (var registration in registrations)
        {
            var key = IdentityOf(registration);
            if (key is null) continue;

            var composite = registration.Type + ":" + key;
            if (!groups.TryGetValue(composite, out var bucket))
            {
                bucket = [];
                groups[composite] = bucket;
            }
            bucket.Add(registration);
        }

        var profiles = new List<Profile>(groups.Count);

        foreach (var (composite, bucket) in groups)
        {
            var ordered = bucket
                .OrderByDescending(r => r.CreatedAt)
                .ThenByDescending(r => r.Id)
                .ToList();

            // The record a reviewer wants is the live membership where there is
            // one; a beneficiary whose only applications were refused still has
            // a profile, showing the most recent of them.
            var current = ordered.FirstOrDefault(IsLive) ?? ordered[0];

            profiles.Add(new Profile(
                current.Id,
                current.Type,
                composite[(composite.IndexOf(':') + 1)..],
                current,
                ordered));
        }

        return profiles
            .OrderByDescending(p => p.Current.ApprovedAt ?? p.Current.CreatedAt)
            .ToList();
    }

    /// <summary>A membership that is current rather than finished with.</summary>
    private static bool IsLive(Registration registration) =>
        registration.Status is not (RegistrationStatuses.Rejected or RegistrationStatuses.Cancelled);

    /// <summary>
    /// What makes this beneficiary themselves. Null when the application
    /// carries nothing identifying, in which case it has no profile of its own
    /// and stays reachable through the queue.
    /// </summary>
    public static string? IdentityOf(Registration registration)
    {
        JsonElement payload;
        try
        {
            payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
        }
        catch (JsonException)
        {
            return null;
        }

        var value = registration.Type == "club"
            ? RegistrationPayload.FirstString(payload, "officialEmail", "nameEn", "nameAr")
            : RegistrationPayload.FirstString(payload, "nationalId");

        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Replace(" ", string.Empty).ToUpperInvariant();
    }
}
