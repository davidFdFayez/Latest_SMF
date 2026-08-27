using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Endpoints;

public static class WhistleblowerEndpoints
{
    public static void MapWhistleblowerEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/whistleblower", async (WhistleblowerCreateRequest? request, SmfDbContext db) =>
        {
            // SEC-01/SEC-02 — a missing or empty body is a 400, never a 500.
            if (request is null)
                return Results.BadRequest(new
                {
                    message = "لم يتم إرسال بيانات البلاغ. / No request body was provided.",
                    messageAr = "لم يتم إرسال بيانات البلاغ.",
                    messageEn = "No request body was provided.",
                });

            var description = request.Description?.Trim() ?? string.Empty;
            var errors = new Dictionary<string, object>();

            if (description.Length < 10)
                errors["description"] = new
                {
                    ar = "يرجى وصف المخالفة بما لا يقل عن 10 أحرف.",
                    en = "Please describe the concern in at least 10 characters.",
                };
            else if (description.Length > 8000)
                errors["description"] = new { ar = "الوصف طويل جداً.", en = "That description is too long." };

            var contact = request.OptionalContact?.Trim();
            if (contact is { Length: > 200 })
                errors["optionalContact"] = new { ar = "بيانات التواصل طويلة جداً.", en = "That contact detail is too long." };

            if (errors.Count > 0)
                return Results.BadRequest(new
                {
                    message = "بعض الحقول غير صحيحة. / Some fields are not valid.",
                    messageAr = "بعض الحقول غير صحيحة.",
                    messageEn = "Some fields are not valid.",
                    errors,
                });

            var report = new WhistleblowerReport
            {
                Description = description,
                OptionalContact = string.IsNullOrWhiteSpace(contact) ? null : contact,
                CreatedAt = DateTime.UtcNow,
                IsReviewed = false
            };

            db.WhistleblowerReports.Add(report);
            await db.SaveChangesAsync();

            report.ReferenceNumber = $"SMF-WB-{report.CreatedAt:yyyy}-{report.Id:D5}";
            await db.SaveChangesAsync();

            return Results.Ok(new { report.ReferenceNumber });
        }).WithTags("Whistleblower");
    }
}
