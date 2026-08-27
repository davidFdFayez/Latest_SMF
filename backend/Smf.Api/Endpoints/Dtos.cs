namespace Smf.Api.Endpoints;

public record LoginRequest(string Username, string Password);
public record LoginResponse(string Token, DateTime ExpiresAt, string Username, string DisplayName);

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
