namespace Smf.Api.Data.Models;

public class PageContent
{
    public int Id { get; set; }

    /// <summary>overview | history | values | strategy | initiatives | goals | achievements | home ...</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>JSON blob describing the bilingual page sections (see PageContentSchema for shape)</summary>
    public string ContentJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
