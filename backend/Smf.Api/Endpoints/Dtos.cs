using System.Text.Json;

namespace Smf.Api.Endpoints;

public record LoginRequest(string Username, string Password);

public record RoleSummary(int Id, string Key, string NameAr, string NameEn);

/// <summary>The signed-in account as the admin UI needs it.</summary>
/// <param name="Permissions">Effective permission keys; "*" means everything.</param>
/// <param name="MembershipGrants">
/// The §6 actions this user may perform, so the admin UI can hide controls the
/// API would refuse. The API checks independently; this is presentation only.
/// </param>
public record AdminProfile(
    int Id,
    string Username,
    string DisplayName,
    IReadOnlyList<RoleSummary> Roles,
    string[] Permissions,
    string[] MembershipGrants);

public record LoginResponse(
    string Token,
    DateTime ExpiresAt,
    int Id,
    string Username,
    string DisplayName,
    IReadOnlyList<RoleSummary> Roles,
    string[] Permissions,
    string[] MembershipGrants);

public record AdminUserCreateRequest(
    string Username,
    string DisplayName,
    string Password,
    bool IsActive,
    int[]? RoleIds,
    string? Email = null);

/// <summary>Username is fixed at creation — the audit trail and registrations record it by name.</summary>
public record AdminUserUpdateRequest(string DisplayName, bool IsActive, int[]? RoleIds, string? Email = null);

public record AdminPasswordResetRequest(string Password);

/// <param name="Key">Required when creating; ignored when updating (keys never change).</param>
public record AdminRoleUpsertRequest(
    string? Key,
    string NameAr,
    string NameEn,
    string? DescriptionAr,
    string? DescriptionEn,
    string[]? Permissions);

public record NewsUpsertRequest(
    string TitleAr, string TitleEn,
    string SummaryAr, string SummaryEn,
    string BodyAr, string BodyEn,
    string Category, string? ImageUrl,
    DateTime? PublishedAt, bool IsPublished,
    string Source, string? ExternalUrl,
    string? ImageFocus = null);

public record EventUpsertRequest(
    string TitleAr, string TitleEn,
    string DescriptionAr, string DescriptionEn,
    string Category, DateTime StartDate, DateTime EndDate,
    string LocationAr, string LocationEn,
    string Status, bool IsPublished,
    string? ImageUrl = null);

/// <summary>§6 — reopening a rejected or cancelled request; the reason is mandatory.</summary>
public record RegistrationReopenRequest(string? Reason);

public record ForgotPasswordRequest(string? Account);

public record ResetPasswordRequest(string? Token, string? Password);

public record ResultUpsertRequest(
    int Year, string Athlete, string AthleteSlug,
    string Event, string Location, string Category, string Medal);

/// <param name="Content">The full page content object; see <see cref="Smf.Api.Data.ContentCatalog"/>.</param>
public record ContentSaveRequest(System.Text.Json.Nodes.JsonNode? Content);

public record RegistrationCreateRequest(string Type, System.Text.Json.JsonElement Payload);
public record RegistrationStatusUpdateRequest(
    string Status,
    string? StatusReason = null,
    string? InternalNotes = null,
    string? MembershipNumber = null);

public record ContactCreateRequest(string Name, string Email, string? Phone, string Subject, string Message);

public record WhistleblowerCreateRequest(string Description, string? OptionalContact);

public record SettingUpsertRequest(string Key, string ValueAr, string ValueEn);

/// <summary>
/// §6 تعديل. Every field is optional: an edit may replace the applicant's
/// payload, adjust the internal notes, set the membership number, or any
/// combination. Omitted fields are left as they are.
/// </summary>
/// <param name="Payload">Replacement applicant data, re-validated server-side.</param>
public record RegistrationEditRequest(
    JsonElement? Payload,
    string? InternalNotes,
    string? MembershipNumber);
