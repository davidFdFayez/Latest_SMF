using System.Text.RegularExpressions;

namespace Smf.Api.Services;

/// <summary>
/// Images and documents uploaded from the admin console for use on the public
/// website (page photos, partner logos, report PDFs).
///
/// Files sit on disk beside smf.db — inside the mounted data volume in the
/// container — under random names, and are served from <c>/api/media/{name}</c>.
/// That path works on both the website and the console because each proxies
/// <c>/api/</c> to this service. Names are never reused, so a URL always means
/// the same bytes and can be cached indefinitely.
/// </summary>
public sealed partial class MediaStore
{
    private sealed record MediaType(string ContentType, Func<byte[], int, bool> Matches);

    /// <summary>
    /// SVG is deliberately absent: it is a document that can carry script, and
    /// nothing on the site needs it badly enough to accept that from an upload.
    /// </summary>
    private static readonly Dictionary<string, MediaType> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".jpg"] = new("image/jpeg", (b, n) => n >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF),
        [".png"] = new("image/png", (b, n) => n >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47),
        [".gif"] = new("image/gif", (b, n) => n >= 4 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8'),
        [".webp"] = new("image/webp", (b, n) => n >= 12
                                                && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
                                                && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P'),
        [".pdf"] = new("application/pdf", (b, n) => n >= 4 && b[0] == '%' && b[1] == 'P' && b[2] == 'D' && b[3] == 'F'),
    };

    [GeneratedRegex("^[a-f0-9]{32}\\.(jpg|png|gif|webp|pdf)$")]
    private static partial Regex StoredName();

    private readonly string _root;
    private readonly long _maxBytes;
    private readonly ILogger<MediaStore> _logger;

    public MediaStore(IWebHostEnvironment environment, IConfiguration configuration, ILogger<MediaStore> logger)
    {
        _logger = logger;

        var configured = configuration["Storage:MediaPath"];
        _root = string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(environment.ContentRootPath, "data", "uploads", "media")
            : Path.GetFullPath(configured);

        _maxBytes = configuration.GetValue<long?>("Storage:MediaMaxBytes") ?? 10 * 1024 * 1024;

        Directory.CreateDirectory(_root);
    }

    public record StoredMedia(string Name, string Url, string ContentType, long Size, string FileName);

    public record SaveResult(StoredMedia? Media, string? ErrorAr = null, string? ErrorEn = null);

    public async Task<SaveResult> SaveAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file.Length == 0)
            return new SaveResult(null, "الملف فارغ.", "The file is empty.");

        var megabytes = _maxBytes / (1024 * 1024);
        if (file.Length > _maxBytes)
            return new SaveResult(null, $"حجم الملف يتجاوز {megabytes} ميجابايت.", $"The file is larger than {megabytes} MB.");

        var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (extension == ".jpeg") extension = ".jpg";

        if (!Types.TryGetValue(extension, out var type))
            return new SaveResult(null,
                "نوع الملف غير مدعوم. المسموح: JPG, PNG, WEBP, GIF, PDF.",
                "Unsupported file type. Allowed: JPG, PNG, WEBP, GIF, PDF.");

        // The extension is only a claim. The first bytes must agree with it,
        // or a renamed HTML file could be served back as an "image".
        var header = new byte[12];
        int read;
        await using (var probe = file.OpenReadStream())
        {
            read = await probe.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false, cancellationToken);
        }

        if (!type.Matches(header, read))
            return new SaveResult(null, "محتوى الملف لا يطابق نوعه.", "The file's contents do not match its type.");

        var name = Guid.NewGuid().ToString("N") + extension;
        await using (var stream = File.Create(Path.Combine(_root, name)))
        {
            await file.CopyToAsync(stream, cancellationToken);
        }

        var original = Path.GetFileName(file.FileName);
        if (original.Length > 180) original = original[^180..];

        _logger.LogInformation("Stored media {Name} ({Size} bytes).", name, file.Length);

        return new SaveResult(new StoredMedia(name, $"/api/media/{name}", type.ContentType, file.Length, original));
    }

    /// <summary>Resolves a stored file by name. Anything not in the generated-name format is refused.</summary>
    public bool TryResolve(string? name, out string path, out string contentType)
    {
        path = string.Empty;
        contentType = string.Empty;

        if (name is null || !StoredName().IsMatch(name)) return false;

        var candidate = Path.Combine(_root, name);
        if (!File.Exists(candidate)) return false;

        path = candidate;
        contentType = Types[Path.GetExtension(name)].ContentType;
        return true;
    }
}
