using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;

namespace Smf.Api.Endpoints;

public static class PagesEndpoints
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static void MapPagesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/pages").WithTags("Pages");

        group.MapGet("/{slug}", async (string slug, string? lang, SmfDbContext db) =>
        {
            var page = await db.Pages.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug);
            if (page is null) return Results.NotFound();

            var doc = JsonSerializer.Deserialize<PageContentDoc>(page.ContentJson, JsonOptions) ?? new PageContentDoc();

            object payload = lang switch
            {
                "ar" => Localize(doc, "ar"),
                "en" => Localize(doc, "en"),
                _ => doc
            };

            return Results.Ok(new
            {
                slug = page.Slug,
                updatedAt = page.UpdatedAt,
                content = payload
            });
        });
    }

    private static object Localize(PageContentDoc doc, string lang)
    {
        bool ar = lang == "ar";

        object? hero = doc.Hero is null ? null : new
        {
            heading = ar ? doc.Hero.HeadingAr : doc.Hero.HeadingEn,
            sub = ar ? doc.Hero.SubAr : doc.Hero.SubEn,
            stats = doc.Hero.Stats?.Select(s => new
            {
                value = s.GetValueOrDefault("value"),
                label = s.GetValueOrDefault(ar ? "labelAr" : "labelEn")
            })
        };

        return new
        {
            meta = new { title = ar ? doc.Meta.TitleAr : doc.Meta.TitleEn },
            hero,
            sections = doc.Sections.Select(section => new
            {
                type = section.Type,
                title = ar ? section.TitleAr : section.TitleEn,
                body = ar ? section.BodyAr : section.BodyEn,
                items = section.Items?.Select(item => LocalizeItem(item, ar))
            })
        };
    }

    private static Dictionary<string, object?> LocalizeItem(Dictionary<string, object?> item, bool ar)
    {
        var result = new Dictionary<string, object?>();
        foreach (var (key, value) in item)
        {
            if (key.EndsWith("Ar") || key.EndsWith("En")) continue;
            result[key] = value;
        }

        if (item.TryGetValue(ar ? "titleAr" : "titleEn", out var title)) result["title"] = title;
        if (item.TryGetValue(ar ? "descAr" : "descEn", out var desc)) result["desc"] = desc;
        if (item.TryGetValue(ar ? "labelAr" : "labelEn", out var label)) result["label"] = label;

        return result;
    }
}
