using System.Security.Cryptography;
using System.Text.Json;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// The member's own copy of their membership — tracker ISSUE-03.
///
/// The beneficiary profile answers "who is this?" for a reviewer sitting in the
/// console. It does nothing for the member, or for the official on the door of
/// a competition who needs to know whether the person in front of them is
/// registered. This is that: one link per membership, with a QR code, that
/// anybody can open and nobody can guess.
///
/// Deliberately *not* an account. There is no password, nothing to reset, and
/// nothing to lock out — which is the right trade for a card you hold up to be
/// scanned, and avoids standing up public authentication for a P3 request.
///
/// What a card shows is the minimum that makes it verifiable: the name, the
/// photo, the membership number, the category, and whether it is in date.
/// Never the national ID, the phone number, the email, the date of birth, or a
/// guardian's details — the link is unguessable, but it is still a public URL,
/// and a public URL is the wrong place for any of that.
/// </summary>
public static class MembershipCards
{
    /// <summary>
    /// A fresh capability token: 32 random bytes, URL-safe.
    ///
    /// Stored as issued rather than hashed, unlike a password-reset token. The
    /// difference is deliberate — this one has to be shown again every time an
    /// administrator opens the profile, and it grants nothing beyond reading a
    /// card that was always meant to be shown. Regenerating it revokes the old
    /// link.
    /// </summary>
    public static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

    /// <summary>
    /// Whether this registration has a card at all. A membership that was never
    /// approved has nothing to verify, so it gets no link.
    /// </summary>
    public static bool IsEligible(Registration registration) =>
        registration.ApprovedAt is not null;

    /// <summary>The standing of a membership, in the terms a card should state.</summary>
    public static (string Key, string Ar, string En) Standing(Registration registration, DateTime now)
    {
        if (registration.Status == RegistrationStatuses.Suspended)
            return ("suspended", "موقوفة", "Suspended");

        if (registration.Status == RegistrationStatuses.Cancelled)
            return ("cancelled", "ملغاة", "Cancelled");

        if (registration.IsExpired(now))
            return ("expired", "منتهية", "Expired");

        if (registration.Status == RegistrationStatuses.Approved)
            return ("valid", "سارية", "Valid");

        // Anything else is a membership in the middle of its approval chain —
        // not a card to be waved at anyone yet.
        return ("inactive", "غير فعّالة", "Not active");
    }

    /// <summary>
    /// What the public card endpoint returns. Assembled here so the shape is in
    /// one place and it is obvious, in review, exactly which fields leave the
    /// building.
    /// </summary>
    public static object Describe(Registration registration, DateTime now, IConfiguration configuration)
    {
        JsonElement payload;
        try
        {
            payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
        }
        catch (JsonException)
        {
            payload = default;
        }

        string? Field(params string[] names) =>
            payload.ValueKind == JsonValueKind.Object ? RegistrationPayload.FirstString(payload, names) : null;

        var (key, standingAr, standingEn) = Standing(registration, now);
        var category = Field("athleteCategory");
        var (categoryAr, categoryEn) = CompetitionCategories.Label(category);
        var track = MembershipTracks.Get(registration.Type);

        return new
        {
            registration.Type,
            nameAr = payload.ValueKind == JsonValueKind.Object
                ? RegistrationPayload.DisplayName(payload, arabic: true)
                : null,
            nameEn = payload.ValueKind == JsonValueKind.Object
                ? RegistrationPayload.DisplayName(payload, arabic: false)
                : null,
            registration.MembershipNumber,
            registration.ReferenceNumber,

            licenceAr = track?.LicenceNameAr,
            licenceEn = track?.LicenceNameEn,

            // Whatever identifies this member within their own track.
            competitionCategory = category is null
                ? null
                : new { value = category, ar = categoryAr, en = categoryEn },
            refereeGrade = Field("refereeGrade"),
            entityType = Field("entityType"),
            region = Field("region"),

            status = key,
            statusAr = standingAr,
            statusEn = standingEn,
            issuedOn = registration.ApprovedAt,
            validUntil = registration.ExpiresAt,
            daysRemaining = registration.DaysRemaining(now),

            hasPhoto = PhotoId(registration) is not null,
            checkedAt = now,
        };
    }

    /// <summary>
    /// The attachment that serves as the card's picture: the member's own
    /// photo, or a club's logo. Null when neither was uploaded, which the card
    /// handles by showing initials instead.
    /// </summary>
    public static string? PhotoId(Registration registration)
    {
        foreach (var slot in new[] { "personalPhoto", "clubLogo" })
        {
            if (RegistrationPayload.Attachment(registration.PayloadJson, slot) is { } id) return id;
        }
        return null;
    }

    /// <summary>
    /// The address a card lives at, built from the public site's own base URL
    /// so a printed QR keeps working after a domain change.
    /// </summary>
    public static string Url(string token, IConfiguration configuration)
    {
        var baseUrl = configuration["Site:BaseUrl"]?.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(baseUrl)) baseUrl = "https://saudimuaythai.sa";
        return $"{baseUrl}/membership/{token}";
    }
}
