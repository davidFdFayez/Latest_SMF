using System.Text.Json;

namespace Smf.Api.Services;

/// <summary>
/// Helpers for reading the free-form JSON body a registration carries. The
/// portal sends a different set of fields per registration type, so nothing
/// here assumes a fixed shape — it only looks for the handful of values the
/// API needs to validate a submission and to label it in the admin dashboard.
/// </summary>
public static class RegistrationPayload
{
    /// <summary>First non-empty string among the given property names.</summary>
    public static string? FirstString(JsonElement payload, params string[] names)
    {
        if (payload.ValueKind != JsonValueKind.Object) return null;

        foreach (var name in names)
        {
            if (!payload.TryGetProperty(name, out var value)) continue;
            if (value.ValueKind != JsonValueKind.String) continue;

            var text = value.GetString();
            if (!string.IsNullOrWhiteSpace(text)) return text.Trim();
        }

        return null;
    }

    /// <summary>
    /// The applicant's name for a notification, assembled from the three name
    /// parts the portal collects (REG-03). Falls back to the other script, and
    /// then to the club or applicant name, so a message is never addressed to
    /// nobody.
    /// </summary>
    public static string? DisplayName(JsonElement payload, bool arabic)
    {
        var primary = JoinParts(payload, arabic ? "Ar" : "En");
        if (primary is not null) return primary;

        var secondary = JoinParts(payload, arabic ? "En" : "Ar");
        if (secondary is not null) return secondary;

        return FirstString(payload, "nameAr", "nameEn", "ownerName", "clubName");
    }

    private static string? JoinParts(JsonElement payload, string suffix)
    {
        var parts = new[] { "firstName", "fatherName", "familyName" }
            .Select(part => FirstString(payload, part + suffix))
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToArray();

        return parts.Length == 0 ? null : string.Join(' ', parts);
    }

    /// <summary>
    /// True when the applicant ticked the declaration on the final step. The
    /// portal sends a boolean; a "true"/"yes" string is accepted as well so a
    /// third-party client cannot fail this by sending the wrong JSON type.
    /// </summary>
    public static bool HasConsent(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object) return false;
        if (!payload.TryGetProperty("consent", out var value)) return false;

        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.String => value.GetString() is "true" or "yes" or "1",
            _ => false,
        };
    }

    /// <summary>
    /// Every attachment identifier referenced by the payload, read from the
    /// <c>attachments</c> object the portal builds:
    /// <c>{ "personalPhoto": { "id": "…", "fileName": "…" }, … }</c>.
    /// Used to prove a requested download really belongs to that request.
    /// </summary>
    public static HashSet<string> AttachmentIds(string? payloadJson)
    {
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (string.IsNullOrWhiteSpace(payloadJson)) return ids;

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!document.RootElement.TryGetProperty("attachments", out var attachments)) return ids;
            if (attachments.ValueKind != JsonValueKind.Object) return ids;

            foreach (var slot in attachments.EnumerateObject())
            {
                if (slot.Value.ValueKind != JsonValueKind.Object) continue;
                if (!slot.Value.TryGetProperty("id", out var id)) continue;
                if (id.ValueKind != JsonValueKind.String) continue;

                var text = id.GetString();
                if (!string.IsNullOrWhiteSpace(text)) ids.Add(text);
            }
        }
        catch (JsonException)
        {
            // A malformed payload simply has no downloadable attachments.
        }

        return ids;
    }

    /// <summary>Loose sanity check — real deliverability is proven by the notification, not here.</summary>
    public static bool LooksLikeEmail(string? value) =>
        !string.IsNullOrWhiteSpace(value)
        && value.Length <= 254
        && value.IndexOf('@') > 0
        && value.LastIndexOf('.') > value.IndexOf('@') + 1
        && !value.Contains(' ');
}
