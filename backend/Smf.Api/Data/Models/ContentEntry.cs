namespace Smf.Api.Data.Models;

/// <summary>
/// The saved content of one website page or site-wide block, as edited in the
/// admin console. A key with no row shows its built-in defaults; deleting the
/// row resets it. See <see cref="ContentCatalog"/> for the schema.
/// </summary>
public class ContentEntry
{
    public int Id { get; set; }

    /// <summary>Definition key, e.g. "home" or "organization-values".</summary>
    public string Key { get; set; } = string.Empty;

    /// <summary>The full content object, normalised against the definition's schema.</summary>
    public string ContentJson { get; set; } = "{}";

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Username of whoever saved it last.</summary>
    public string? UpdatedBy { get; set; }
}
