namespace Smf.Api.Data.Models;

public class AdminUser
{
    public int Id { get; set; }
    public string Username { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string PasswordSalt { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Work address for this account. Optional, but an account without one
    /// cannot use the self-service password reset — there is nowhere to send
    /// the link.
    /// </summary>
    public string? Email { get; set; }

    /// <summary>The roles this user holds; their permissions are the union of these.</summary>
    public List<AdminUserRole> Roles { get; set; } = [];

    /// <summary>
    /// Legacy — the single <see cref="AdminRoles"/> key a user held before roles
    /// moved into the database. Read once, when the role tables are first
    /// seeded, to carry existing assignments over; nothing authorises against
    /// it. Still mapped because existing databases have it as a NOT NULL
    /// column, which an insert must fill.
    /// </summary>
    public string Role { get; set; } = string.Empty;

    /// <summary>Legacy — the §6 <see cref="MembershipRoles"/> key; migrated like <see cref="Role"/>.</summary>
    public string? MembershipRole { get; set; }

    /// <summary>
    /// Changes whenever the password does. Tokens carry the stamp they were
    /// issued with, so a reset immediately invalidates sessions opened with
    /// the old password instead of leaving them valid for hours.
    /// </summary>
    public string SecurityStamp { get; set; } = "initial";

    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
