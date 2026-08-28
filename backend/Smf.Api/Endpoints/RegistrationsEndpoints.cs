using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

public static class RegistrationsEndpoints
{
    /// <summary>
    /// Registration categories the portal offers (§6–§9). "referee" is the word
    /// the public portal uses; it is stored as "official" so the existing admin
    /// filters, reference prefixes, and seeded data keep working.
    /// </summary>
    private static readonly Dictionary<string, string> TypeAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["athlete"] = "athlete",
        ["club"] = "club",
        ["coach"] = "coach",
        ["official"] = "official",
        ["referee"] = "official",
    };

    /// <summary>Reference-number prefixes advertised on the registration hub.</summary>
    private static readonly Dictionary<string, string> ReferencePrefixes = new()
    {
        ["athlete"] = "A",
        ["club"] = "C",
        ["coach"] = "T",
        ["official"] = "O",
    };

    private static readonly Dictionary<string, (string Ar, string En)> TypeLabels = new()
    {
        ["athlete"] = ("لاعب", "athlete"),
        ["club"] = ("نادٍ / منشأة", "club"),
        ["coach"] = ("مدرب", "coach"),
        ["official"] = ("حكم", "referee"),
    };

    public static void MapRegistrationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/registrations", async (
            RegistrationCreateRequest? request,
            SmfDbContext db,
            EmailSender email,
            ILoggerFactory loggerFactory,
            CancellationToken cancellationToken) =>
        {
            // SEC-01/SEC-02 — an empty or malformed body is a client error, so
            // it is answered with a 400 rather than being allowed to blow up
            // further down as a 500.
            if (request is null)
                return Problem("لم يتم إرسال بيانات الطلب.", "No request body was provided.");

            if (!TypeAliases.TryGetValue(request.Type ?? string.Empty, out var type))
                return Problem("نوع تسجيل غير معروف.", "Unknown registration type.");

            var payload = request.Payload;
            if (payload.ValueKind != JsonValueKind.Object)
                return Problem("بيانات الطلب غير صالحة.", "The request payload is not a valid object.");

            // §10: the declaration on the final step is what authorises the
            // federation to hold and process these details, so it is mandatory.
            if (!RegistrationPayload.HasConsent(payload))
                return Problem(
                    "يجب الموافقة على الإقرار قبل إرسال الطلب.",
                    "You must accept the declaration before submitting.");

            // Every rule the wizard enforces, re-checked here (SEC-01).
            var validation = RegistrationValidator.Validate(type, payload);
            if (!validation.IsValid)
            {
                return Results.BadRequest(new
                {
                    message = "بعض الحقول غير صحيحة. / Some fields are not valid.",
                    messageAr = "بعض الحقول غير صحيحة. يرجى مراجعة البيانات المحددة.",
                    messageEn = "Some fields are not valid. Please review the highlighted entries.",
                    errors = validation.Errors.ToDictionary(
                        entry => entry.Key,
                        entry => new { ar = entry.Value.Ar, en = entry.Value.En }),
                });
            }

            var registration = new Registration
            {
                Type = type,
                PayloadJson = payload.GetRawText(),
                Status = RegistrationStatuses.New,
                CreatedAt = DateTime.UtcNow,
            };

            // §6 — إعادة التقديم بعد الرفض. A rejection is terminal, so applying
            // again opens a fresh request; linking it to the rejected one lets a
            // reviewer see what was wrong last time instead of starting blind.
            registration.SupersedesId = await FindSupersededAsync(db, type, payload, cancellationToken);

            db.Registrations.Add(registration);
            await db.SaveChangesAsync(cancellationToken);

            // Assigned after the insert so the sequence never collides.
            var prefix = ReferencePrefixes[type];
            registration.ReferenceNumber = $"SMF-{prefix}-{registration.CreatedAt:yyyy}-{registration.Id:D5}";
            await db.SaveChangesAsync(cancellationToken);

            await SendConfirmationAsync(registration, payload, type, email, cancellationToken);

            return Results.Ok(new
            {
                registration.ReferenceNumber,
                registration.Id,
                registration.Status,
                statusLabelAr = RegistrationStatuses.Labels[registration.Status].Ar,
                statusLabelEn = RegistrationStatuses.Labels[registration.Status].En,
            });
        })
        .RequireRateLimiting(RateLimitPolicies.PublicRegistration)
        .WithTags("Registrations");

        // Documents are uploaded one at a time as the applicant picks them, so a
        // large club licence never has to be re-sent if the form is corrected.
        // The returned id is what the submitted payload references.
        app.MapPost("/api/registrations/attachments", async (
            IFormFile? file,
            RegistrationAttachmentStore store,
            CancellationToken cancellationToken) =>
        {
            if (file is null)
                return Problem("لم يتم إرفاق ملف.", "No file was attached.");

            var result = await store.SaveAsync(file, cancellationToken);

            return result.Succeeded
                ? Results.Ok(result.Attachment)
                : Results.BadRequest(new { message = result.Error });
        })
        .DisableAntiforgery()
        .RequireRateLimiting(RateLimitPolicies.PublicRegistration)
        .WithTags("Registrations");
    }

    /// <summary>
    /// The applicant's most recent rejected request of this type, if any.
    ///
    /// Identity is the national/residency id where the form collects one, and
    /// the email address otherwise. Only rejected requests are matched: an
    /// applicant with one already in flight is submitting a duplicate rather
    /// than re-applying, and linking those would misrepresent the history.
    /// </summary>
    private static async Task<int?> FindSupersededAsync(
        SmfDbContext db,
        string type,
        JsonElement payload,
        CancellationToken cancellationToken)
    {
        var nationalId = RegistrationPayload.FirstString(payload, "nationalId");
        var email = RegistrationPayload.FirstString(payload, "email", "applicantEmail", "officialEmail");

        if (nationalId is null && email is null) return null;

        // The identity lives inside the stored JSON, so candidates are narrowed
        // in the database and matched in memory rather than with a LIKE over it.
        var candidates = await db.Registrations
            .Where(r => r.Type == type && r.Status == RegistrationStatuses.Rejected)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new { r.Id, r.PayloadJson })
            .ToListAsync(cancellationToken);

        foreach (var candidate in candidates)
        {
            JsonElement previous;
            try
            {
                previous = JsonDocument.Parse(candidate.PayloadJson).RootElement;
            }
            catch (JsonException)
            {
                continue;
            }

            if (nationalId is not null
                && string.Equals(RegistrationPayload.FirstString(previous, "nationalId"), nationalId, StringComparison.OrdinalIgnoreCase))
                return candidate.Id;

            if (nationalId is null
                && email is not null
                && string.Equals(
                    RegistrationPayload.FirstString(previous, "email", "applicantEmail", "officialEmail"),
                    email,
                    StringComparison.OrdinalIgnoreCase))
                return candidate.Id;
        }

        return null;
    }

    /// <summary>Bilingual 400, in the shape the portal knows how to display.</summary>
    private static IResult Problem(string ar, string en) =>
        Results.BadRequest(new { message = $"{ar} / {en}", messageAr = ar, messageEn = en });

    /// <summary>
    /// REG-06 — the applicant receives the reference number by email as soon as
    /// the request is stored, in whichever language they filled the form in.
    /// </summary>
    private static async Task SendConfirmationAsync(
        Registration registration,
        JsonElement payload,
        string type,
        EmailSender email,
        CancellationToken cancellationToken)
    {
        var template = NotificationTemplates.Get(NotificationTemplates.SubmissionReceived);
        if (template is null) return;

        var recipient = RegistrationPayload.FirstString(payload, "email", "applicantEmail", "officialEmail");
        if (recipient is null) return;

        var arabic = RegistrationPayload.FirstString(payload, "submittedLanguage") != "en";
        var labels = TypeLabels[type];

        var values = new Dictionary<string, string?>
        {
            [NotificationTemplates.Vars.Name] = RegistrationPayload.DisplayName(payload, arabic),
            [NotificationTemplates.Vars.RegistrationType] = arabic ? labels.Ar : labels.En,
            [NotificationTemplates.Vars.RequestNumber] = registration.ReferenceNumber,
        };

        var subject = NotificationTemplates.Render(arabic ? template.SubjectAr : template.SubjectEn, values);
        var body = NotificationTemplates.Render(arabic ? template.BodyAr : template.BodyEn, values);

        await email.SendAsync(recipient, subject, body, cancellationToken);
    }
}
