using System.Text.Json;

namespace Smf.Api.Services;

/// <summary>
/// File storage for the documents collected by the registration portal (§10 of
/// the approved content requirements: personal photo, ID/Iqama, birth
/// certificate, guardian consent, coaching/refereeing certificates, municipal
/// licence, and so on).
///
/// Files are written to disk rather than the database so the SQLite file stays
/// small and so nothing new has to be added to the schema — the registration's
/// PayloadJson simply carries the returned identifiers.
///
/// Every stored file gets an opaque GUID name plus a sidecar
/// <c>{guid}.meta.json</c> holding the original file name and content type.
/// Lookups accept the GUID only, so a crafted identifier can never escape the
/// uploads directory.
/// </summary>
public sealed class RegistrationAttachmentStore
{
    /// <summary>Extensions the federation accepts for registration documents.</summary>
    private static readonly Dictionary<string, string> AllowedTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".png"] = "image/png",
        [".webp"] = "image/webp",
        [".pdf"] = "application/pdf",
    };

    /// <summary>
    /// 1 MB (REG-09). The portal compresses images to fit before uploading, so
    /// the cap is about what reaches the disk rather than what the applicant
    /// picks; a document that is still oversized is refused with the limit named.
    /// </summary>
    public const long MaxFileSizeBytes = 1024 * 1024;

    private const string SizeLabelAr = "1 ميجابايت";
    private const string SizeLabelEn = "1 MB";

    public static IReadOnlyCollection<string> AllowedExtensions => AllowedTypes.Keys;

    private readonly string _root;
    private readonly ILogger<RegistrationAttachmentStore> _logger;

    public RegistrationAttachmentStore(
        IWebHostEnvironment environment,
        IConfiguration configuration,
        ILogger<RegistrationAttachmentStore> logger)
    {
        _logger = logger;

        // Defaults to <contentRoot>/data/uploads/registrations, which in the
        // container sits inside the mounted smf-api-data volume alongside smf.db.
        var configured = configuration["Storage:RegistrationUploadsPath"];
        _root = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "data", "uploads", "registrations")
            : Path.GetFullPath(configured);

        Directory.CreateDirectory(_root);
    }

    public record StoredAttachment(string Id, string FileName, string ContentType, long Size);

    public record SaveResult(StoredAttachment? Attachment, string? Error)
    {
        public bool Succeeded => Attachment is not null;
    }

    /// <summary>
    /// Validates and stores one uploaded document. Returns a human-readable
    /// error instead of throwing, so the endpoint can answer with a 400 the
    /// applicant can act on.
    /// </summary>
    public async Task<SaveResult> SaveAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file is null || file.Length == 0)
            return new SaveResult(null, "الملف فارغ. / The file is empty.");

        if (file.Length > MaxFileSizeBytes)
            return new SaveResult(null, $"حجم الملف يتجاوز {SizeLabelAr}. / The file exceeds {SizeLabelEn}.");

        var extension = Path.GetExtension(file.FileName);
        if (string.IsNullOrWhiteSpace(extension) || !AllowedTypes.TryGetValue(extension, out var contentType))
            return new SaveResult(null, "نوع الملف غير مدعوم. المسموح: JPG, PNG, WEBP, PDF. / Unsupported file type. Allowed: JPG, PNG, WEBP, PDF.");

        var id = Guid.NewGuid().ToString("N");
        var storedName = id + extension.ToLowerInvariant();
        var path = Path.Combine(_root, storedName);

        await using (var stream = File.Create(path))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        // Keep the applicant's original file name for the reviewer without ever
        // letting it influence the path on disk.
        var displayName = Path.GetFileName(file.FileName);
        if (displayName.Length > 180) displayName = displayName[^180..];

        var meta = new AttachmentMeta(storedName, displayName, contentType, file.Length, DateTime.UtcNow);
        await File.WriteAllTextAsync(Path.Combine(_root, id + ".meta.json"), JsonSerializer.Serialize(meta), cancellationToken);

        _logger.LogInformation("Stored registration attachment {AttachmentId} ({Size} bytes).", id, file.Length);

        return new SaveResult(new StoredAttachment(id, displayName, contentType, file.Length), null);
    }

    /// <summary>
    /// Resolves a stored document by identifier. Anything that is not a plain
    /// GUID is rejected outright.
    /// </summary>
    public bool TryResolve(string? id, out string path, out AttachmentMeta meta)
    {
        path = string.Empty;
        meta = default!;

        if (string.IsNullOrWhiteSpace(id) || !Guid.TryParseExact(id, "N", out _)) return false;

        var metaPath = Path.Combine(_root, id + ".meta.json");
        if (!File.Exists(metaPath)) return false;

        try
        {
            var parsed = JsonSerializer.Deserialize<AttachmentMeta>(File.ReadAllText(metaPath));
            if (parsed is null) return false;

            // StoredName is written by us, but re-derive the path defensively so a
            // hand-edited meta file cannot point outside the uploads directory.
            var candidate = Path.Combine(_root, Path.GetFileName(parsed.StoredName));
            if (!File.Exists(candidate)) return false;

            path = candidate;
            meta = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public record AttachmentMeta(
        string StoredName,
        string FileName,
        string ContentType,
        long Size,
        DateTime UploadedAt);
}
