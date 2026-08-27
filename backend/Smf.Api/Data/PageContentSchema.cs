namespace Smf.Api.Data;

/// <summary>
/// Shape used for the <see cref="Models.PageContent.ContentJson"/> blob.
/// Serialized with camelCase property names, e.g.:
/// { "meta": {"titleAr":"...","titleEn":"..."},
///   "hero": {"headingAr":"...","headingEn":"...","subAr":"...","subEn":"...","stats":[{"value":"2019","labelAr":"...","labelEn":"..."}]},
///   "sections": [ {"type":"richtext","titleAr":"...","titleEn":"...","bodyAr":"...","bodyEn":"..."}, ... ] }
/// </summary>
public class PageContentDoc
{
    public MetaBlock Meta { get; set; } = new();
    public HeroBlock? Hero { get; set; }
    public List<Section> Sections { get; set; } = new();
}

public class MetaBlock
{
    public string TitleAr { get; set; } = string.Empty;
    public string TitleEn { get; set; } = string.Empty;
}

public class HeroBlock
{
    public string HeadingAr { get; set; } = string.Empty;
    public string HeadingEn { get; set; } = string.Empty;
    public string SubAr { get; set; } = string.Empty;
    public string SubEn { get; set; } = string.Empty;
    public List<Dictionary<string, object?>>? Stats { get; set; }
}

/// <summary>
/// Flexible content block. `Type` drives how the frontend renders it, e.g.
/// richtext | timeline | cards | stats | list | cta | highlights.
/// `Items` shape depends on `Type` (timeline items use year/titleAr/titleEn/descAr/descEn,
/// cards/list use icon/titleAr/titleEn/descAr/descEn, stats use value/labelAr/labelEn).
/// </summary>
public class Section
{
    public string Type { get; set; } = "richtext";
    public string? TitleAr { get; set; }
    public string? TitleEn { get; set; }
    public string? BodyAr { get; set; }
    public string? BodyEn { get; set; }
    public List<Dictionary<string, object?>>? Items { get; set; }
}
