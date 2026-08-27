using System.Text.RegularExpressions;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Endpoints;

public static class ContactEndpoints
{
    private static readonly Regex EmailPattern = new(@"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", RegexOptions.Compiled);

    public static void MapContactEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/contact", async (ContactCreateRequest? request, SmfDbContext db) =>
        {
            // UX-01/SEC-01 — the browser form is not the only way in here, so
            // the required fields are enforced again and a bad body answers 400
            // with the offending fields rather than 500.
            if (request is null)
                return Results.BadRequest(new
                {
                    message = "لم يتم إرسال بيانات الرسالة. / No request body was provided.",
                    messageAr = "لم يتم إرسال بيانات الرسالة.",
                    messageEn = "No request body was provided.",
                });

            var errors = new Dictionary<string, object>();

            void Fail(string field, string ar, string en) => errors[field] = new { ar, en };

            var name = request.Name?.Trim() ?? string.Empty;
            var mail = request.Email?.Trim() ?? string.Empty;
            var message = request.Message?.Trim() ?? string.Empty;
            var subject = request.Subject?.Trim() ?? string.Empty;

            if (name.Length < 2) Fail("name", "الاسم مطلوب.", "Your name is required.");
            if (!EmailPattern.IsMatch(mail) || mail.Length > 254)
                Fail("email", "يرجى إدخال بريد إلكتروني صحيح.", "Please enter a valid email address.");
            if (message.Length < 5) Fail("message", "الرسالة مطلوبة.", "A message is required.");
            if (name.Length > 120) Fail("name", "الاسم طويل جداً.", "That name is too long.");
            if (message.Length > 5000) Fail("message", "الرسالة طويلة جداً.", "That message is too long.");
            if (subject.Length > 200) Fail("subject", "الموضوع طويل جداً.", "That subject is too long.");

            if (errors.Count > 0)
                return Results.BadRequest(new
                {
                    message = "بعض الحقول غير صحيحة. / Some fields are not valid.",
                    messageAr = "بعض الحقول غير صحيحة.",
                    messageEn = "Some fields are not valid.",
                    errors,
                });

            var record = new ContactMessage
            {
                Name = name,
                Email = mail,
                Phone = request.Phone?.Trim(),
                Subject = subject,
                Message = message,
                CreatedAt = DateTime.UtcNow,
                IsRead = false
            };

            db.ContactMessages.Add(record);
            await db.SaveChangesAsync();

            return Results.Ok(new { success = true, id = record.Id });
        }).WithTags("Contact");
    }
}
