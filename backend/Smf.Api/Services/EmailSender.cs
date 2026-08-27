using System.Net;
using System.Net.Mail;
using System.Text;

namespace Smf.Api.Services;

/// <summary>
/// Outbound email for the registration lifecycle (REG-06).
///
/// The federation has no transactional mail provider yet, so this deliberately
/// supports two modes and picks whichever is configured:
///
///   • <b>SMTP</b> — set <c>Email:Host</c> (plus port/credentials) and messages
///     go out over the wire.
///   • <b>Outbox</b> — with no host configured, each message is written as a
///     .eml file under <c>Email:OutboxPath</c> and logged. Nothing silently
///     disappears, the reference number is verifiable in testing, and switching
///     to real delivery later is a configuration change rather than a code one.
///
/// A send failure never fails the applicant's submission — the request is
/// already stored, and a lost notification is logged for follow-up instead.
/// </summary>
public sealed class EmailSender
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<EmailSender> _logger;
    private readonly string _outboxPath;

    public EmailSender(IWebHostEnvironment environment, IConfiguration configuration, ILogger<EmailSender> logger)
    {
        _configuration = configuration;
        _logger = logger;

        var configured = configuration["Email:OutboxPath"];
        _outboxPath = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "data", "outbox")
            : Path.GetFullPath(configured);
    }

    private string FromAddress => _configuration["Email:From"] ?? "info@saudimuaythai.sa";
    private string FromName => _configuration["Email:FromName"] ?? "Saudi Muaythai Federation";
    private string? Host => _configuration["Email:Host"];

    public async Task SendAsync(string to, string subject, string body, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(to))
        {
            _logger.LogWarning("Skipped notification '{Subject}' — no recipient address.", subject);
            return;
        }

        try
        {
            if (string.IsNullOrWhiteSpace(Host))
            {
                await WriteToOutboxAsync(to, subject, body, cancellationToken);
                return;
            }

            using var message = new MailMessage
            {
                From = new MailAddress(FromAddress, FromName),
                Subject = subject,
                Body = body,
                IsBodyHtml = false,
                BodyEncoding = Encoding.UTF8,
                SubjectEncoding = Encoding.UTF8,
            };
            message.To.Add(to);

            using var client = new SmtpClient(Host, int.TryParse(_configuration["Email:Port"], out var port) ? port : 587)
            {
                EnableSsl = !bool.TryParse(_configuration["Email:UseSsl"], out var ssl) || ssl,
            };

            var user = _configuration["Email:User"];
            var password = _configuration["Email:Password"];
            if (!string.IsNullOrWhiteSpace(user))
            {
                client.Credentials = new NetworkCredential(user, password);
            }

            await client.SendMailAsync(message, cancellationToken);
            _logger.LogInformation("Sent notification '{Subject}' to {Recipient}.", subject, Mask(to));
        }
        catch (Exception ex)
        {
            // The registration itself is already saved; losing the mail must not
            // turn a successful submission into an error for the applicant.
            _logger.LogError(ex, "Failed to send notification '{Subject}' to {Recipient}.", subject, Mask(to));
        }
    }

    private async Task WriteToOutboxAsync(string to, string subject, string body, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_outboxPath);

        var fileName = $"{DateTime.UtcNow:yyyyMMdd-HHmmssfff}-{Guid.NewGuid():N}.eml";
        var content = new StringBuilder()
            .AppendLine($"From: {FromName} <{FromAddress}>")
            .AppendLine($"To: {to}")
            .AppendLine($"Subject: {subject}")
            .AppendLine($"Date: {DateTime.UtcNow:R}")
            .AppendLine("MIME-Version: 1.0")
            .AppendLine("Content-Type: text/plain; charset=utf-8")
            .AppendLine()
            .Append(body)
            .ToString();

        await File.WriteAllTextAsync(Path.Combine(_outboxPath, fileName), content, Encoding.UTF8, cancellationToken);

        _logger.LogInformation(
            "Email:Host is not configured — wrote notification '{Subject}' for {Recipient} to the outbox as {File}.",
            subject, Mask(to), fileName);
    }

    /// <summary>Recipient addresses are never written to the log in full.</summary>
    private static string Mask(string address)
    {
        var at = address.IndexOf('@');
        if (at <= 1) return "***";
        return $"{address[0]}***{address[at..]}";
    }
}
