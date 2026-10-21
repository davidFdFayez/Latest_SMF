using System.Text.Json;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Sends one lifecycle notification on both channels §6 requires — email and
/// SMS — and records each attempt against the request.
///
/// Every step used to send and forget: if a provider was unconfigured or an
/// address was missing, the only trace was a line in the server log, so
/// "the applicant says they never got the rejection email" could not be
/// answered from the console. Each attempt is now a row the reviewer can see,
/// including the ones that went to the on-disk outbox because no mail server
/// is configured yet.
/// </summary>
public sealed class NotificationDispatcher(
    SmfDbContext db,
    EmailSender email,
    SmsSender sms,
    ILogger<NotificationDispatcher> logger)
{
    public bool EmailConfigured => email.IsConfigured;
    public bool SmsConfigured => sms.IsConfigured;
    public string EmailOutboxPath => email.OutboxPath;
    public string SmsOutboxPath => sms.OutboxPath;

    /// <summary>
    /// Renders <paramref name="templateKey"/> in the language the applicant
    /// used, sends it, and saves one log row per channel. Never throws: the
    /// decision that triggered the message is already committed.
    /// </summary>
    public async Task SendAsync(
        string templateKey,
        Registration registration,
        JsonElement payload,
        IDictionary<string, string?> values,
        CancellationToken cancellationToken = default)
    {
        var template = NotificationTemplates.Get(templateKey);
        if (template is null)
        {
            logger.LogWarning("No notification template named '{Key}'; nothing sent.", templateKey);
            return;
        }

        var arabic = RegistrationPayload.FirstString(payload, "submittedLanguage") != "en";

        var address = RegistrationPayload.FirstString(payload, "email", "applicantEmail", "officialEmail");
        var subject = NotificationTemplates.Render(arabic ? template.SubjectAr : template.SubjectEn, values);
        var body = NotificationTemplates.Render(arabic ? template.BodyAr : template.BodyEn, values);
        Record(registration, NotificationChannels.Email, templateKey, address, subject,
            await email.SendAsync(address, subject, body, cancellationToken));

        var mobile = RegistrationPayload.FirstString(payload, "phone", "mobile", "applicantPhone", "officialPhone");
        var text = NotificationTemplates.Render(arabic ? template.SmsAr : template.SmsEn, values);
        Record(registration, NotificationChannels.Sms, templateKey, mobile, null,
            await sms.SendAsync(mobile, text, cancellationToken));

        await db.SaveChangesAsync(cancellationToken);
    }

    /// <summary>
    /// A message that belongs to no registration — an account invitation, say.
    /// Logged the same way as any other, so "did they get it?" has one answer
    /// whatever the message was.
    /// </summary>
    public async Task SendAsync(
        int? registrationId,
        string? entityRef,
        string templateKey,
        string? recipientEmail,
        string? recipientMobile,
        string subject,
        string body,
        CancellationToken cancellationToken = default)
    {
        if (!string.IsNullOrWhiteSpace(recipientEmail))
        {
            var result = await email.SendAsync(recipientEmail, subject, body, cancellationToken);
            db.NotificationLog.Add(new NotificationLog
            {
                RegistrationId = registrationId,
                EntityRef = Trim(entityRef, 100),
                Channel = NotificationChannels.Email,
                TemplateKey = templateKey,
                Recipient = Trim(recipientEmail, 200),
                Subject = Trim(subject, 300),
                Status = result.Status,
                Detail = Trim(result.Detail, 1000),
                CreatedAt = DateTime.UtcNow,
            });
        }

        if (!string.IsNullOrWhiteSpace(recipientMobile))
        {
            var result = await sms.SendAsync(recipientMobile, body, cancellationToken);
            db.NotificationLog.Add(new NotificationLog
            {
                RegistrationId = registrationId,
                EntityRef = Trim(entityRef, 100),
                Channel = NotificationChannels.Sms,
                TemplateKey = templateKey,
                Recipient = Trim(recipientMobile, 200),
                Status = result.Status,
                Detail = Trim(result.Detail, 1000),
                CreatedAt = DateTime.UtcNow,
            });
        }

        await db.SaveChangesAsync(cancellationToken);
    }

    private void Record(
        Registration registration,
        string channel,
        string templateKey,
        string? recipient,
        string? subject,
        DeliveryResult result)
    {
        db.NotificationLog.Add(new NotificationLog
        {
            RegistrationId = registration.Id,
            EntityRef = registration.ReferenceNumber,
            Channel = channel,
            TemplateKey = templateKey,
            Recipient = Trim(recipient, 200),
            Subject = Trim(subject, 300),
            Status = result.Status,
            Detail = Trim(result.Detail, 1000),
            CreatedAt = DateTime.UtcNow,
        });
    }

    private static string? Trim(string? value, int max) =>
        value is { Length: > 0 } && value.Length > max ? value[..max] : value;
}
