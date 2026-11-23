using System.Security.Cryptography;
using System.Text;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Which athlete photos the PUBLIC site shows, and how they are addressed.
///
/// SMTF rule (2026-11-17): an athlete whose membership is APPROVED and whose
/// athlete account is ACTIVE has their registered profile photo shown in the
/// public bracket. Concretely, all of:
/// <list type="bullet">
/// <item>the registration's status is <c>approved</c> and its membership term has not expired
/// (so suspended, expired, cancelled, rejected and pending memberships never qualify);</item>
/// <item>an athlete member account for that registration is active — <c>IsActive</c> and
/// activated (the invitation accepted); a pending or deactivated account does not qualify;</item>
/// <item>the registration has a stored <c>personalPhoto</c> image — the only document ever eligible:
/// never an identity document, guardian consent form or medical file (the Admin's own rule,
/// <see cref="DrawService.AthletePhotoId"/>).</item>
/// </list>
/// Anyone else gets the neutral avatar. A photo is fetched by its bracket slot
/// (round, position, corner), never by an entry, registration or attachment id;
/// the version key is a hash of the stored image, so it changes when the photo is
/// replaced and reveals nothing.
///
/// Owner decision (2026-11-21): this is the federation's rule as it stands. An athlete whose
/// account is Active has completed the federation's verification and approval, so their photo is
/// shown publicly — in the bracket and in the published Match Schedule — for adults and under-18
/// athletes alike, with no further consent, age rule or per-photo approval.
/// </summary>
public static class PublicPhotos
{
    public static bool Authorized(Registration? registration, IEnumerable<MemberAccount> accounts,
        RegistrationAttachmentStore store, DateTime asOf, out string? photoId)
    {
        photoId = null;
        if (registration is null) return false;
        if (registration.Status != RegistrationStatuses.Approved || registration.IsExpired(asOf)) return false;
        var active = accounts.Any(a => a.RegistrationId == registration.Id && a.Kind == MemberAccountKinds.Athlete
                                       && a.IsActive && a.ActivatedAt is not null);
        if (!active) return false;
        photoId = DrawService.AthletePhotoId(store, registration.PayloadJson);
        return photoId is not null;
    }

    /// <summary>A short, opaque version key for an authorized photo.</summary>
    public static string Key(string photoId) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes("smtf-public-photo:" + photoId)))[..12].ToLowerInvariant();
}
