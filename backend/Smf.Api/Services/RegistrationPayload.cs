using System.Text.Json;
using Smf.Api.Data;

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
    /// Writes one document into the payload's <c>attachments</c> object, or
    /// removes the slot when <paramref name="attachment"/> is null (BUG-11).
    ///
    /// Slots are the names the portal used — personalPhoto, idDocument, and so
    /// on — so a document the console adds is indistinguishable from one the
    /// applicant uploaded, and the download endpoint's "is this id referenced
    /// by this registration" check keeps working unchanged.
    /// </summary>
    public static string WithAttachment(
        string? payloadJson,
        string slot,
        object? attachment)
    {
        using var document = JsonDocument.Parse(
            string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);
        var root = document.RootElement;

        var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();

            foreach (var property in root.EnumerateObject())
            {
                if (property.NameEquals("attachments")) continue;
                property.WriteTo(writer);
            }

            writer.WriteStartObject("attachments");

            if (root.TryGetProperty("attachments", out var existing)
                && existing.ValueKind == JsonValueKind.Object)
            {
                foreach (var entry in existing.EnumerateObject())
                {
                    if (string.Equals(entry.Name, slot, StringComparison.Ordinal)) continue;
                    entry.WriteTo(writer);
                }
            }

            if (attachment is not null)
            {
                writer.WritePropertyName(slot);
                JsonSerializer.Serialize(writer, attachment, attachment.GetType(), JsonOptions);
            }

            writer.WriteEndObject();
            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>
    /// Every document on a request, as { slot, id, fileName, contentType } —
    /// what a profile or a review screen needs to list them (ISSUE-03).
    /// </summary>
    public static IReadOnlyList<object> AttachmentsOf(string? payloadJson)
    {
        var results = new List<object>();
        if (string.IsNullOrWhiteSpace(payloadJson)) return results;

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!document.RootElement.TryGetProperty("attachments", out var attachments)) return results;
            if (attachments.ValueKind != JsonValueKind.Object) return results;

            foreach (var slot in attachments.EnumerateObject())
            {
                if (slot.Value.ValueKind != JsonValueKind.Object) continue;
                if (!slot.Value.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String) continue;

                results.Add(new
                {
                    slot = slot.Name,
                    id = id.GetString(),
                    fileName = slot.Value.TryGetProperty("fileName", out var name) && name.ValueKind == JsonValueKind.String
                        ? name.GetString()
                        : null,
                    contentType = slot.Value.TryGetProperty("contentType", out var ct) && ct.ValueKind == JsonValueKind.String
                        ? ct.GetString()
                        : null,
                });
            }
        }
        catch (JsonException)
        {
            return results;
        }

        return results;
    }

    /// <summary>
    /// Returns the payload with these fields set — used when an authorised
    /// user accepts a change an account holder proposed (Phase 3 REQ-05/06/07).
    ///
    /// Only scalar values: anything nested is managed through its own flow,
    /// and a text box is the wrong tool for it.
    /// </summary>
    public static string WithFields(string? payloadJson, IReadOnlyDictionary<string, string> fields)
    {
        using var document = JsonDocument.Parse(
            string.IsNullOrWhiteSpace(payloadJson) ? "{}" : payloadJson);

        var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();

            foreach (var property in document.RootElement.EnumerateObject())
            {
                if (fields.ContainsKey(property.Name)) continue;
                property.WriteTo(writer);
            }

            foreach (var (name, value) in fields) writer.WriteString(name, value);

            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }

    /// <summary>The id of the document currently in a slot, or null when it is empty.</summary>
    public static string? Attachment(string? payloadJson, string slot)
    {
        if (string.IsNullOrWhiteSpace(payloadJson)) return null;

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!document.RootElement.TryGetProperty("attachments", out var attachments)) return null;
            if (attachments.ValueKind != JsonValueKind.Object) return null;
            if (!attachments.TryGetProperty(slot, out var entry)) return null;
            if (entry.ValueKind != JsonValueKind.Object) return null;
            if (!entry.TryGetProperty("id", out var id) || id.ValueKind != JsonValueKind.String) return null;

            var text = id.GetString();
            return string.IsNullOrWhiteSpace(text) ? null : text;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>The slot a given attachment id occupies, or null if it is not there.</summary>
    public static string? SlotOf(string? payloadJson, string attachmentId)
    {
        if (string.IsNullOrWhiteSpace(payloadJson)) return null;

        try
        {
            using var document = JsonDocument.Parse(payloadJson);
            if (!document.RootElement.TryGetProperty("attachments", out var attachments)) return null;
            if (attachments.ValueKind != JsonValueKind.Object) return null;

            foreach (var slot in attachments.EnumerateObject())
            {
                if (slot.Value.ValueKind != JsonValueKind.Object) continue;
                if (!slot.Value.TryGetProperty("id", out var id)) continue;
                if (id.ValueKind != JsonValueKind.String) continue;
                if (string.Equals(id.GetString(), attachmentId, StringComparison.OrdinalIgnoreCase))
                    return slot.Name;
            }
        }
        catch (JsonException)
        {
            return null;
        }

        return null;
    }

    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    /// <summary>
    /// Rewrites an athlete's payload so the competition category is the one the
    /// server calculated, not the one the client sent (tracker items 00 and
    /// BUG-15).
    ///
    /// The portal no longer asks for a category, but a direct POST can still
    /// claim one, and a reviewer editing a request may legitimately move an
    /// athlete between the categories their age allows. So: a submitted value is
    /// kept only when it is one of the eligible categories, and is replaced by
    /// the primary assignment otherwise. The eligible list and the Masters band
    /// are stored alongside it, so the admin screen can offer exactly the
    /// categories this athlete may hold without recomputing them.
    ///
    /// Returns the payload unchanged for every other registration type.
    /// </summary>
    public static string WithCalculatedCategory(JsonElement payload, string type)
    {
        if (type != "athlete" || payload.ValueKind != JsonValueKind.Object) return payload.GetRawText();

        var dateOfBirth = ParseDate(FirstString(payload, "dateOfBirth"));
        var eligible = CompetitionCategories.EligibleFor(dateOfBirth);

        // Nothing sensible to calculate: leave the payload alone and let
        // validation be the thing that refuses the request.
        if (eligible.Count == 0) return payload.GetRawText();

        // A value stored before Masters was split into three bands still means
        // something; normalise it before deciding whether to keep it.
        var submitted = CompetitionCategories.Normalise(
            FirstString(payload, "athleteCategory"), dateOfBirth);

        var category = eligible.Any(entry => entry.Value == submitted)
            ? submitted!
            : CompetitionCategories.PrimaryFor(dateOfBirth)!;

        var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();

            foreach (var property in payload.EnumerateObject())
            {
                if (property.NameEquals("athleteCategory")
                    // Written before Phase 3 split Masters into three; dropped
                    // on rewrite so a stale band cannot contradict the category.
                    || property.NameEquals("mastersBand")
                    || property.NameEquals("competitionTrack")
                    || property.NameEquals("eligibleCategories"))
                {
                    continue;
                }
                property.WriteTo(writer);
            }

            writer.WriteString("athleteCategory", category);
            writer.WriteString("competitionTrack", CompetitionCategories.TrackOf(category) ?? string.Empty);

            writer.WriteStartArray("eligibleCategories");
            foreach (var entry in eligible) writer.WriteStringValue(entry.Value);
            writer.WriteEndArray();

            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(buffer.ToArray());
    }

    private static DateTime? ParseDate(string? isoDate)
    {
        if (string.IsNullOrWhiteSpace(isoDate)) return null;
        return DateTime.TryParseExact(isoDate, "yyyy-MM-dd",
            System.Globalization.CultureInfo.InvariantCulture,
            System.Globalization.DateTimeStyles.None, out var parsed)
            ? parsed
            : null;
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
