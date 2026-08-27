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

    /// <summary>
    /// One of <see cref="MembershipRoles"/>, or null. Held separately from
    /// <see cref="Role"/> because §6 of the Phase 2 workflow document grants
    /// membership permissions along a different axis than site areas: a person
    /// who administers events does not thereby gain any say over the register,
    /// and reviewing a membership is a distinct grant from approving one.
    /// </summary>
    public string? MembershipRole { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
