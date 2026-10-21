namespace Smf.Api.Data.Models;

/// <summary>
/// A named bundle of permissions that can be assigned to admin users.
/// Permission keys come from <see cref="AdminPermissions"/>.
/// </summary>
public class AdminRole
{
    public int Id { get; set; }

    /// <summary>Stable machine name, e.g. "media_approver". Unique; never changes after creation.</summary>
    public string Key { get; set; } = string.Empty;

    public string NameAr { get; set; } = string.Empty;
    public string NameEn { get; set; } = string.Empty;
    public string DescriptionAr { get; set; } = string.Empty;
    public string DescriptionEn { get; set; } = string.Empty;

    /// <summary>
    /// Locked roles (the Super Admin) cannot be deleted and their permissions
    /// cannot be changed, so the console always keeps a role that can repair
    /// everything else.
    /// </summary>
    public bool IsSystem { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public List<AdminRolePermission> Permissions { get; set; } = [];
    public List<AdminUserRole> Users { get; set; } = [];
}

/// <summary>One permission granted by a role.</summary>
public class AdminRolePermission
{
    public int AdminRoleId { get; set; }
    public AdminRole? Role { get; set; }

    /// <summary>A key from <see cref="AdminPermissions"/>.</summary>
    public string Permission { get; set; } = string.Empty;
}

/// <summary>One role held by an admin user. A user may hold several; their permissions add up.</summary>
public class AdminUserRole
{
    public int AdminUserId { get; set; }
    public AdminUser? User { get; set; }

    public int AdminRoleId { get; set; }
    public AdminRole? Role { get; set; }
}
