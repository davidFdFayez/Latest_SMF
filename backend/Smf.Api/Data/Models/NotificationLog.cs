namespace Smf.Api.Data.Models;

/// <summary>
/// One attempt to notify an applicant, recorded whatever the outcome.
///
/// §6 of the Phase 2 document requires a message at every lifecycle step
/// "عبر البريد الإلكتروني والرسائل النصية". Delivery itself depends on an
/// external mail or SMS provider, so the system records what it tried to send,
/// to whom, and what happened — otherwise "did the applicant get the rejection
/// email?" can only be answered by reading server logs.
/// </summary>
public class NotificationLog
{
    public int Id { get; set; }

    public int? RegistrationId { get; set; }

    /// <summary>The request's reference number, kept even if the request is deleted.</summary>
    public string? EntityRef { get; set; }

    /// <summary>email | sms</summary>
    public string Channel { get; set; } = NotificationChannels.Email;

    /// <summary>Key from <see cref="Smf.Api.Services.NotificationTemplates"/>.</summary>
    public string TemplateKey { get; set; } = string.Empty;

    /// <summary>Address or number the message was addressed to.</summary>
    public string? Recipient { get; set; }

    public string? Subject { get; set; }

    /// <summary>sent | outbox | failed | skipped — see <see cref="NotificationStatuses"/>.</summary>
    public string Status { get; set; } = NotificationStatuses.Sent;

    /// <summary>Error text, outbox file name, or the reason it was skipped.</summary>
    public string? Detail { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class NotificationChannels
{
    public const string Email = "email";
    public const string Sms = "sms";
}

public static class NotificationStatuses
{
    /// <summary>Handed to the mail server or SMS gateway.</summary>
    public const string Sent = "sent";

    /// <summary>No provider configured, so it was written to the on-disk outbox instead.</summary>
    public const string Outbox = "outbox";

    /// <summary>The provider refused it or the attempt threw.</summary>
    public const string Failed = "failed";

    /// <summary>Nothing to send to — the applicant gave no address or number.</summary>
    public const string Skipped = "skipped";

    public static readonly Dictionary<string, (string Ar, string En)> Labels = new()
    {
        [Sent] = ("تم الإرسال", "Sent"),
        [Outbox] = ("في صندوق الصادر", "Held in outbox"),
        [Failed] = ("فشل الإرسال", "Failed"),
        [Skipped] = ("لا يوجد مستلم", "No recipient"),
    };
}
