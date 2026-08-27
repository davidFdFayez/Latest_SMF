namespace Smf.Api.Services;

/// <summary>
/// Outbound SMS for the membership lifecycle.
///
/// §6 of the Phase 2 workflow document requires every lifecycle notification to
/// go out "عبر البريد الإلكتروني والرسائل النصية" — email <em>and</em> SMS. The
/// federation has not named an SMS gateway, so this follows the same shape as
/// <see cref="EmailSender"/>: with no provider configured each message is
/// written to an outbox file and logged, so nothing is silently dropped and
/// wiring a real gateway later is a configuration change rather than a code one.
///
/// Copy comes from <see cref="NotificationTemplates"/>, whose SMS variants are
/// already written short and, by design, never carry a rejection reason.
/// </summary>
public sealed class SmsSender
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<SmsSender> _logger;
    private readonly string _outboxPath;

    public SmsSender(IWebHostEnvironment environment, IConfiguration configuration, ILogger<SmsSender> logger)
    {
        _configuration = configuration;
        _logger = logger;

        var configured = configuration["Sms:OutboxPath"];
        _outboxPath = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "data", "sms-outbox")
            : Path.GetFullPath(configured);
    }

    /// <summary>Set <c>Sms:Provider</c> once a gateway exists; until then, outbox mode.</summary>
    private string? Provider => _configuration["Sms:Provider"];

    public async Task SendAsync(string? to, string message, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(to))
        {
            _logger.LogWarning("Skipped SMS — no recipient number.");
            return;
        }

        try
        {
            if (string.IsNullOrWhiteSpace(Provider))
            {
                await WriteToOutboxAsync(to, message, cancellationToken);
                return;
            }

            // No gateway is integrated yet. Reaching here means Sms:Provider was
            // set without an implementation behind it, which is a configuration
            // error worth surfacing rather than failing silently.
            _logger.LogError(
                "SMS provider '{Provider}' is configured but not implemented; message to {To} was not sent.",
                Provider, Mask(to));
        }
        catch (Exception ex)
        {
            // A lost notification must never fail the decision that triggered it:
            // the status change is already committed by this point.
            _logger.LogError(ex, "Failed to send SMS to {To}.", Mask(to));
        }
    }

    private async Task WriteToOutboxAsync(string to, string message, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_outboxPath);

        var name = $"{DateTime.UtcNow:yyyyMMdd-HHmmss-fff}-{Guid.NewGuid():N}.txt";
        var path = Path.Combine(_outboxPath, name);

        var contents = $"To: {to}{Environment.NewLine}Sent: {DateTime.UtcNow:O}{Environment.NewLine}{Environment.NewLine}{message}{Environment.NewLine}";
        await File.WriteAllTextAsync(path, contents, cancellationToken);

        _logger.LogInformation("SMS to {To} written to the outbox at {Path}.", Mask(to), path);
    }

    /// <summary>
    /// Phone numbers are personal data and logs are not access-controlled, so
    /// only enough digits to correlate a message are written out.
    /// </summary>
    private static string Mask(string to) =>
        to.Length <= 4 ? new string('*', to.Length) : new string('*', to.Length - 4) + to[^4..];
}
