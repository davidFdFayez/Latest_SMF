namespace Smf.Api.Data.Models;

// Role vocabulary lives in Smf.Api.Data.AdminRoles.

public class AdminUser
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string PasswordSalt { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>One of <see cref="AdminRoles"/>; drives which areas the user administers.</summary>
    public string Role { get; set; } = AdminRoles.SuperAdmin;

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
