using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// What became of one outbound message. Senders report this instead of
/// swallowing the outcome, so every attempt can be recorded against the
/// request it belongs to (see <see cref="NotificationDispatcher"/>).
/// </summary>
/// <param name="Status">One of <see cref="NotificationStatuses"/>.</param>
/// <param name="Detail">Outbox file name, provider error, or why it was skipped.</param>
public readonly record struct DeliveryResult(string Status, string? Detail = null)
{
    public static DeliveryResult Sent() => new(NotificationStatuses.Sent);

    public static DeliveryResult Outbox(string file) => new(NotificationStatuses.Outbox, file);

    public static DeliveryResult Failed(string error) => new(NotificationStatuses.Failed, error);

    public static DeliveryResult Skipped(string reason) => new(NotificationStatuses.Skipped, reason);
}
