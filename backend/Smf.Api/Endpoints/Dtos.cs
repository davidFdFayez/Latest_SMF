using System.Text.Json;

namespace Smf.Api.Endpoints;

public record LoginRequest(string Username, string Password);
/// <param name="Role">Site-area role — see <see cref="Smf.Api.Data.AdminRoles"/>.</param>
/// <param name="MembershipRole">Membership-register role (§6), or null.</param>
/// <param name="MembershipGrants">
/// The §6 actions this user may perform, so the admin UI can hide controls the
/// API would refuse. The API checks independently; this is presentation only.
/// </param>
public record LoginResponse(
    string Token,
    DateTime ExpiresAt,
    string Username,
    string DisplayName,
    string Role,
    string? MembershipRole,
    string[] MembershipGrants);

public record NewsUpsertRequest(
    string TitleAr, string TitleEn,
    string SummaryAr, string SummaryEn,
    string BodyAr, string BodyEn,
    string Category, string? ImageUrl,
    DateTime? PublishedAt, bool IsPublished,
    string Source, string? ExternalUrl);

public record EventUpsertRequest(
    string TitleAr, string TitleEn,
    string DescriptionAr, string DescriptionEn,
    string Category, DateTime StartDate, DateTime EndDate,
    string LocationAr, string LocationEn,
    string Status, bool IsPublished);

public record ResultUpsertRequest(
    int Year, string Athlete, string AthleteSlug,
    string Event, string Location, string Category, string Medal);

public record PageUpsertRequest(string ContentJson);

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
