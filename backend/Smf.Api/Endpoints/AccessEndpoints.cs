using System.Security.Claims;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// Admin accounts, roles, and the permissions roles grant.
///
/// One rule runs through every write here: nobody can hand out, or take
/// control of, more than they already hold. A user manager can only assign
/// roles whose permissions they have themselves, and can only edit or reset the
/// password of an account whose permissions they cover. Without it, anyone
/// holding "users" could give themselves Super Admin, or reset a Super Admin's
/// password and sign in as them.
/// </summary>
public static partial class AccessEndpoints
{
    [GeneratedRegex("^[a-z0-9._-]{3,50}$")]
    private static partial Regex UsernamePattern();

    [GeneratedRegex("^[a-z][a-z0-9_]{1,49}$")]
    private static partial Regex RoleKeyPattern();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")]
    private static partial Regex EmailPattern();

    public static void MapAccessAdmin(this RouteGroupBuilder admin)
    {
        // The catalogue a role editor picks from. `held` marks what the caller
        // may grant, so the console can disable the rest.
        admin.MapGet("/access/permissions", (ClaimsPrincipal principal) =>
        {
            var actor = AdminIdentity.Current(principal);
            return Results.Ok(AdminPermissions.Groups.Select(g => new
            {
                key = g.Key,
                nameAr = g.NameAr,
                nameEn = g.NameEn,
                permissions = AdminPermissions.Definitions
                    .Where(d => d.GroupKey == g.Key)
                    .Select(d => new
                    {
                        key = d.Key,
                        nameAr = d.NameAr,
                        nameEn = d.NameEn,
                        description = d.DescriptionEn,
                        held = actor.Has(d.Key),
                    }),
            }));
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.Permissions);

        MapRoles(admin);
        MapUsers(admin);
    }

    private static void MapRoles(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/roles");

        // Readable by user managers too — they need the list to assign roles.
        group.MapGet("/", async (ClaimsPrincipal principal, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var roles = await db.Roles.AsNoTracking()
                .Include(r => r.Permissions)
                .OrderByDescending(r => r.IsSystem).ThenBy(r => r.NameEn)
                .ToListAsync(cancellationToken);

            var holders = await db.UserRoles
                .GroupBy(ur => ur.AdminRoleId)
                .Select(g => new { g.Key, Count = g.Count() })
                .ToDictionaryAsync(x => x.Key, x => x.Count, cancellationToken);

            return Results.Ok(roles.Select(r => RoleView(r, holders.GetValueOrDefault(r.Id), actor)));
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.Permissions);

        group.MapGet("/{id:int}", async (int id, ClaimsPrincipal principal, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var role = await db.Roles.AsNoTracking()
                .Include(r => r.Permissions)
                .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (role is null) return Results.NotFound();

            var holders = await db.UserRoles.CountAsync(ur => ur.AdminRoleId == id, cancellationToken);
            return Results.Ok(RoleView(role, holders, AdminIdentity.Current(principal)));
        }).RequirePermission(AdminPermissions.Users, AdminPermissions.Permissions);

        group.MapPost("/", async (
            AdminRoleUpsertRequest request,
            ClaimsPrincipal principal,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var key = request.Key?.Trim().ToLowerInvariant() ?? string.Empty;
            if (!RoleKeyPattern().IsMatch(key))
                return Error(400,
                    "المعرّف يجب أن يبدأ بحرف ويحتوي على أحرف إنجليزية صغيرة وأرقام وشرطات سفلية فقط.",
                    "The key must start with a letter and use only lowercase letters, digits and underscores (2–50 characters).");

            if (ValidateRole(request, validatePermissions: true, out var permissions) is { } invalid) return invalid;
            if (!AdminPermissions.Covers(actor.Permissions, permissions)) return CannotGrant();

            if (await db.Roles.AnyAsync(r => r.Key == key, cancellationToken))
                return Error(409, "يوجد دور بهذا المعرّف.", $"A role with the key '{key}' already exists.");

            var role = new AdminRole
            {
                Key = key,
                NameAr = request.NameAr.Trim(),
                NameEn = request.NameEn.Trim(),
                DescriptionAr = request.DescriptionAr?.Trim() ?? string.Empty,
                DescriptionEn = request.DescriptionEn?.Trim() ?? string.Empty,
                CreatedAt = DateTime.UtcNow,
                Permissions = permissions.Select(p => new AdminRolePermission { Permission = p }).ToList(),
            };

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            db.Roles.Add(role);
            await db.SaveChangesAsync(cancellationToken);

            audit.Write(actor, AuditActions.RoleCreated, "admin_role", role.Id, role.Key,
                details: $"Permissions: {Describe(permissions)}");
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return Results.Created($"/api/admin/roles/{role.Id}", RoleView(role, 0, actor));
        }).RequirePermission(AdminPermissions.Permissions);

        group.MapPut("/{id:int}", async (
            int id,
            AdminRoleUpsertRequest request,
            ClaimsPrincipal principal,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (role is null) return Results.NotFound();

            // The Super Admin's permissions are locked, so whatever the request
            // says about them is ignored rather than validated.
            if (ValidateRole(request, validatePermissions: !role.IsSystem, out var permissions) is { } invalid) return invalid;

            var current = role.Permissions.Select(p => p.Permission).ToHashSet();
            if (!AdminPermissions.Covers(actor.Permissions, current)) return CannotManageRole();

            role.NameAr = request.NameAr.Trim();
            role.NameEn = request.NameEn.Trim();
            role.DescriptionAr = request.DescriptionAr?.Trim() ?? string.Empty;
            role.DescriptionEn = request.DescriptionEn?.Trim() ?? string.Empty;

            if (!role.IsSystem)
            {
                if (!AdminPermissions.Covers(actor.Permissions, permissions)) return CannotGrant();

                db.RolePermissions.RemoveRange(role.Permissions.Where(p => !permissions.Contains(p.Permission)).ToList());
                foreach (var permission in permissions.Except(current))
                    db.RolePermissions.Add(new AdminRolePermission { AdminRoleId = role.Id, Permission = permission });
            }

            audit.Write(actor, AuditActions.RoleUpdated, "admin_role", role.Id, role.Key,
                details: role.IsSystem ? "Names/descriptions updated." : $"Permissions: {Describe(permissions)}");
            await db.SaveChangesAsync(cancellationToken);

            var saved = await db.Roles.AsNoTracking().Include(r => r.Permissions).FirstAsync(r => r.Id == id, cancellationToken);
            var holders = await db.UserRoles.CountAsync(ur => ur.AdminRoleId == id, cancellationToken);
            return Results.Ok(RoleView(saved, holders, actor));
        }).RequirePermission(AdminPermissions.Permissions);

        group.MapDelete("/{id:int}", async (
            int id,
            ClaimsPrincipal principal,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (role is null) return Results.NotFound();

            if (role.IsSystem)
                return Error(400, "لا يمكن حذف دور الصلاحية الكاملة.", "The Super Admin role cannot be deleted.");

            var current = role.Permissions.Select(p => p.Permission).ToHashSet();
            if (!AdminPermissions.Covers(actor.Permissions, current)) return CannotManageRole();

            // Deleting a role that people hold would strip their access as a
            // side effect of tidying up, so it has to be unassigned deliberately.
            var holders = await db.UserRoles.CountAsync(ur => ur.AdminRoleId == id, cancellationToken);
            if (holders > 0)
                return Error(409,
                    $"هذا الدور مسند إلى {holders} مستخدم. أزله منهم قبل الحذف.",
                    $"This role is assigned to {holders} user(s). Remove it from them before deleting it.");

            audit.Write(actor, AuditActions.RoleDeleted, "admin_role", role.Id, role.Key,
                details: $"{role.NameEn}; permissions: {Describe(current)}");
            db.Roles.Remove(role);
            await db.SaveChangesAsync(cancellationToken);

            return Results.NoContent();
        }).RequirePermission(AdminPermissions.Permissions);
    }

    private static void MapUsers(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/users").RequirePermission(AdminPermissions.Users);

        group.MapGet("/", async (ClaimsPrincipal principal, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);
            var users = await UsersWithRoles(db).OrderBy(u => u.Username).ToListAsync(cancellationToken);
            return Results.Ok(users.Select(u => UserView(u, actor)));
        });

        group.MapGet("/{id:int}", async (int id, ClaimsPrincipal principal, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var user = await UsersWithRoles(db).FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
            return user is null ? Results.NotFound() : Results.Ok(UserView(user, AdminIdentity.Current(principal)));
        });

        group.MapPost("/", async (
            AdminUserCreateRequest request,
            ClaimsPrincipal principal,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var username = request.Username?.Trim().ToLowerInvariant() ?? string.Empty;
            if (!UsernamePattern().IsMatch(username))
                return Error(400,
                    "اسم المستخدم من 3 إلى 50 حرفاً: أحرف إنجليزية صغيرة وأرقام ونقاط وشرطات.",
                    "Usernames are 3–50 characters: lowercase letters, digits, dots, hyphens and underscores.");

            if (ValidateDisplayName(request.DisplayName) is { } badName) return badName;
            if (ValidatePassword(request.Password) is { } weak) return weak;
            if (ValidateEmail(request.Email) is { } badEmail) return badEmail;

            var address = Normalise(request.Email);
            if (address is not null && await db.AdminUsers.AnyAsync(u => u.Email != null && u.Email.ToLower() == address, cancellationToken))
                return Error(409, "البريد الإلكتروني مستخدم لحساب آخر.", $"The email address '{address}' is already used by another account.");

            var (roles, roleError) = await ResolveRolesAsync(db, request.RoleIds, cancellationToken);
            if (roleError is not null) return roleError;
            if (roles.Any(r => !AdminPermissions.Covers(actor.Permissions, PermissionsOf(r)))) return CannotGrant();

            if (await db.AdminUsers.AnyAsync(u => u.Username.ToLower() == username, cancellationToken))
                return Error(409, "اسم المستخدم مستخدم مسبقاً.", $"The username '{username}' is already taken.");

            var (hash, salt) = PasswordHasher.HashPassword(request.Password);
            var user = new AdminUser
            {
                Username = username,
                DisplayName = request.DisplayName.Trim(),
                Email = address,
                PasswordHash = hash,
                PasswordSalt = salt,
                IsActive = request.IsActive,
                CreatedAt = DateTime.UtcNow,
                Roles = roles.Select(r => new AdminUserRole { AdminRoleId = r.Id }).ToList(),
            };

            await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
            db.AdminUsers.Add(user);
            await db.SaveChangesAsync(cancellationToken);

            audit.Write(actor, AuditActions.UserCreated, "admin_user", user.Id, user.Username,
                details: $"Roles: {Describe(roles.Select(r => r.Key))}; active: {user.IsActive}");
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            var created = await UsersWithRoles(db).FirstAsync(u => u.Id == user.Id, cancellationToken);
            return Results.Created($"/api/admin/users/{user.Id}", UserView(created, actor));
        });

        group.MapPut("/{id:int}", async (
            int id,
            AdminUserUpdateRequest request,
            ClaimsPrincipal principal,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var user = await db.AdminUsers
                .Include(u => u.Roles).ThenInclude(ur => ur.Role).ThenInclude(r => r!.Permissions)
                .AsSplitQuery()
                .FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
            if (user is null) return Results.NotFound();

            if (ValidateDisplayName(request.DisplayName) is { } badName) return badName;
            if (ValidateEmail(request.Email) is { } badEmail) return badEmail;

            var address = Normalise(request.Email);
            if (address is not null && await db.AdminUsers.AnyAsync(
                    u => u.Id != id && u.Email != null && u.Email.ToLower() == address, cancellationToken))
                return Error(409, "البريد الإلكتروني مستخدم لحساب آخر.", $"The email address '{address}' is already used by another account.");

            var (roles, roleError) = await ResolveRolesAsync(db, request.RoleIds, cancellationToken);
            if (roleError is not null) return roleError;

            var currentIds = user.Roles.Select(ur => ur.AdminRoleId).ToHashSet();
            var nextIds = roles.Select(r => r.Id).ToHashSet();
            var isSelf = actor.Id == user.Id;

            // Changing your own roles or switching yourself off is how people
            // lock themselves out; it takes a second administrator.
            if (isSelf && (!currentIds.SetEquals(nextIds) || user.IsActive != request.IsActive))
                return Error(400,
                    "لا يمكنك تغيير أدوارك أو تعطيل حسابك. اطلب ذلك من مسؤول آخر.",
                    "You cannot change your own roles or deactivate your own account. Ask another administrator.");

            var currentPermissions = PermissionsOf(user);
            if (!isSelf && !AdminPermissions.Covers(actor.Permissions, currentPermissions)) return CannotManageUser();

            if (roles.Where(r => !currentIds.Contains(r.Id)).Any(r => !AdminPermissions.Covers(actor.Permissions, PermissionsOf(r))))
                return CannotGrant();

            var isActiveSuperAdmin = user.IsActive && currentPermissions.Contains(AdminPermissions.All);
            var staysSuperAdmin = request.IsActive && roles.Any(r => PermissionsOf(r).Contains(AdminPermissions.All));
            if (isActiveSuperAdmin && !staysSuperAdmin && !await OtherActiveSuperAdminExistsAsync(db, user.Id, cancellationToken))
                return Error(400,
                    "هذا آخر حساب نشط بصلاحية كاملة. امنح هذا الدور لحساب نشط آخر أولاً.",
                    "This is the last active Super Admin. Give another active account the Super Admin role first.");

            user.DisplayName = request.DisplayName.Trim();
            user.Email = address;
            user.IsActive = request.IsActive;

            db.UserRoles.RemoveRange(user.Roles.Where(ur => !nextIds.Contains(ur.AdminRoleId)).ToList());
            foreach (var roleId in nextIds.Except(currentIds))
                db.UserRoles.Add(new AdminUserRole { AdminUserId = user.Id, AdminRoleId = roleId });

            audit.Write(actor, AuditActions.UserUpdated, "admin_user", user.Id, user.Username,
                details: $"Roles: {Describe(roles.Select(r => r.Key))}; active: {user.IsActive}");
            await db.SaveChangesAsync(cancellationToken);

            var updated = await UsersWithRoles(db).FirstAsync(u => u.Id == id, cancellationToken);
            return Results.Ok(UserView(updated, actor));
        });

        group.MapPost("/{id:int}/password", async (
            int id,
            AdminPasswordResetRequest request,
            ClaimsPrincipal principal,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(principal);

            var user = await db.AdminUsers.FirstOrDefaultAsync(u => u.Id == id, cancellationToken);
            if (user is null) return Results.NotFound();

            if (actor.Id != id)
            {
                var access = await AdminIdentity.LoadAsync(db, id, cancellationToken);
                if (access is null || !AdminPermissions.Covers(actor.Permissions, access.Permissions)) return CannotManageUser();
            }

            if (ValidatePassword(request.Password) is { } weak) return weak;

            (user.PasswordHash, user.PasswordSalt) = PasswordHasher.HashPassword(request.Password);

            // Sessions opened with the old password stop working immediately.
            user.SecurityStamp = Guid.NewGuid().ToString("N");

            audit.Write(actor, AuditActions.UserPasswordReset, "admin_user", user.Id, user.Username);
            await db.SaveChangesAsync(cancellationToken);

            return Results.NoContent();
        });
    }

    private static IQueryable<AdminUser> UsersWithRoles(SmfDbContext db) =>
        db.AdminUsers.AsNoTracking()
            .Include(u => u.Roles).ThenInclude(ur => ur.Role).ThenInclude(r => r!.Permissions)
            .AsSplitQuery();

    private static HashSet<string> PermissionsOf(AdminRole role) =>
        role.Permissions.Select(p => p.Permission).ToHashSet();

    private static HashSet<string> PermissionsOf(AdminUser user) =>
        user.Roles.Where(ur => ur.Role is not null)
            .SelectMany(ur => ur.Role!.Permissions)
            .Select(p => p.Permission)
            .ToHashSet();

    private static object RoleView(AdminRole role, int userCount, AdminIdentity.Actor actor)
    {
        var permissions = role.Permissions.Select(p => p.Permission).Order().ToArray();
        return new
        {
            role.Id,
            role.Key,
            role.NameAr,
            role.NameEn,
            role.DescriptionAr,
            role.DescriptionEn,
            role.IsSystem,
            role.CreatedAt,
            permissions,
            userCount,
            canManage = AdminPermissions.Covers(actor.Permissions, permissions),
        };
    }

    private static object UserView(AdminUser user, AdminIdentity.Actor actor)
    {
        var permissions = PermissionsOf(user);
        var isSelf = actor.Id == user.Id;
        return new
        {
            user.Id,
            user.Username,
            user.DisplayName,
            user.Email,
            user.IsActive,
            user.CreatedAt,
            roles = user.Roles
                .Select(ur => ur.Role!)
                .OrderBy(r => r.NameEn)
                .Select(r => new { r.Id, r.Key, r.NameAr, r.NameEn, r.IsSystem }),
            permissions = permissions.Order().ToArray(),
            isSelf,
            canManage = isSelf || AdminPermissions.Covers(actor.Permissions, permissions),
        };
    }

    private static async Task<(List<AdminRole> Roles, IResult? Error)> ResolveRolesAsync(
        SmfDbContext db, int[]? ids, CancellationToken cancellationToken)
    {
        var wanted = (ids ?? []).Distinct().ToList();
        var roles = await db.Roles.AsNoTracking()
            .Include(r => r.Permissions)
            .Where(r => wanted.Contains(r.Id))
            .ToListAsync(cancellationToken);

        return roles.Count == wanted.Count
            ? (roles, null)
            : (roles, Error(400, "أحد الأدوار المحددة غير موجود.", "One of the selected roles no longer exists."));
    }

    private static Task<bool> OtherActiveSuperAdminExistsAsync(SmfDbContext db, int userId, CancellationToken cancellationToken) =>
        db.UserRoles.AnyAsync(ur =>
            ur.AdminUserId != userId
            && ur.User!.IsActive
            && ur.Role!.Permissions.Any(p => p.Permission == AdminPermissions.All),
            cancellationToken);

    private static IResult? ValidateRole(AdminRoleUpsertRequest request, bool validatePermissions, out HashSet<string> permissions)
    {
        permissions = (request.Permissions ?? [])
            .Select(p => p?.Trim() ?? string.Empty)
            .Where(p => p.Length > 0)
            .ToHashSet();

        if (string.IsNullOrWhiteSpace(request.NameEn) || string.IsNullOrWhiteSpace(request.NameAr)
            || request.NameEn.Trim().Length > 100 || request.NameAr.Trim().Length > 100)
            return Error(400,
                "اسم الدور بالعربية والإنجليزية مطلوب (100 حرف كحد أقصى).",
                "The role needs an English and an Arabic name (up to 100 characters each).");

        if ((request.DescriptionEn?.Length ?? 0) > 500 || (request.DescriptionAr?.Length ?? 0) > 500)
            return Error(400, "الوصف طويل جداً (500 حرف كحد أقصى).", "Descriptions are limited to 500 characters.");

        if (!validatePermissions) return null;

        // The wildcard belongs to the locked Super Admin role alone.
        var unknown = permissions.Where(p => p == AdminPermissions.All || !AdminPermissions.IsKnown(p)).ToList();
        return unknown.Count > 0
            ? Error(400, "صلاحيات غير معروفة.", $"Unknown permission(s): {string.Join(", ", unknown)}.")
            : null;
    }

    private static IResult? ValidateDisplayName(string? displayName) =>
        string.IsNullOrWhiteSpace(displayName) || displayName.Trim().Length > 100
            ? Error(400, "الاسم المعروض مطلوب (100 حرف كحد أقصى).", "A display name is required (up to 100 characters).")
            : null;

    private static IResult? ValidatePassword(string? password) =>
        PasswordPolicy.IsAcceptable(password)
            ? null
            : Error(400, PasswordPolicy.MessageAr, PasswordPolicy.MessageEn);

    /// <summary>An address is optional, but one that is given must be usable — a reset link is sent to it.</summary>
    private static IResult? ValidateEmail(string? email)
    {
        var address = Normalise(email);
        if (address is null) return null;

        return address.Length <= 200 && EmailPattern().IsMatch(address)
            ? null
            : Error(400, "البريد الإلكتروني غير صالح.", "Enter a valid email address, or leave it blank.");
    }

    private static string? Normalise(string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : email.Trim().ToLowerInvariant();

    private static string Describe(IEnumerable<string> values)
    {
        var list = values.Order().ToList();
        return list.Count == 0 ? "(none)" : string.Join(", ", list);
    }

    private static IResult CannotGrant() => Error(403,
        "لا يمكنك منح صلاحيات أو أدوار لا تملكها أنت.",
        "You can only grant permissions — or assign roles — that you hold yourself.");

    private static IResult CannotManageRole() => Error(403,
        "هذا الدور يمنح صلاحيات لا تملكها، لذا لا يمكنك تعديله.",
        "This role grants permissions you do not hold, so you cannot change it.");

    private static IResult CannotManageUser() => Error(403,
        "هذا الحساب يملك صلاحيات لا تملكها، لذا لا يمكنك تعديله.",
        "This account holds permissions you do not have, so you cannot change it.");

    private static IResult Error(int status, string ar, string en) => Results.Json(new
    {
        message = $"{ar} / {en}",
        messageAr = ar,
        messageEn = en,
    }, statusCode: status);
}
