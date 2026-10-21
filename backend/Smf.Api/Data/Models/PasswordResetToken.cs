namespace Smf.Api.Data.Models;

/// <summary>
/// A single-use, expiring password-reset token for an admin account.
///
/// Only a hash is stored: the raw token exists in the email and the reset link
/// and nowhere else, so a copy of the database does not let anyone take over an
/// account. Requesting a new link invalidates any earlier unused one.
/// </summary>
public class PasswordResetToken
{
    public int Id { get; set; }

    public int AdminUserId { get; set; }
    public AdminUser? User { get; set; }

    /// <summary>SHA-256 of the token, hex-encoded.</summary>
    public string TokenHash { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime ExpiresAt { get; set; }

    /// <summary>Set the moment the token is spent, so it cannot be replayed.</summary>
    public DateTime? UsedAt { get; set; }

    public bool IsUsable(DateTime now) => UsedAt is null && ExpiresAt > now;
}
