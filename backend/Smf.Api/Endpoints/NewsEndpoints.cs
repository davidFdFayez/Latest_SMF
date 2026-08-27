using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Endpoints;

public static class NewsEndpoints
{
    public static void MapNewsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/news").WithTags("News");

        group.MapGet("/", async (SmfDbContext db, string? lang, string? category, int page = 1, int pageSize = 10) =>
        {
            page = page <= 0 ? 1 : page;
            pageSize = pageSize <= 0 ? 10 : Math.Min(pageSize, 50);

            var query = db.NewsArticles.AsNoTracking().Where(n => n.IsPublished);

            if (!string.IsNullOrWhiteSpace(category))
                query = query.Where(n => n.Category == category);

            var total = await query.CountAsync();

            var items = await query
                .OrderByDescending(n => n.PublishedAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            return Results.Ok(new
            {
                total,
                page,
                pageSize,
                items = items.Select(n => Project(n, lang))
            });
        });

        group.MapGet("/{id:int}", async (int id, string? lang, SmfDbContext db) =>
        {
            var article = await db.NewsArticles.AsNoTracking().FirstOrDefaultAsync(n => n.Id == id && n.IsPublished);
            return article is null ? Results.NotFound() : Results.Ok(Project(article, lang));
        });
    }

    private static object Project(NewsArticle n, string? lang) => lang switch
    {
        "ar" => new
        {
            n.Id,
            title = n.TitleAr,
            summary = n.SummaryAr,
            body = n.BodyAr,
            n.Category,
            n.ImageUrl,
            n.PublishedAt,
            n.Source,
            n.ExternalUrl
        },
        "en" => new
        {
            n.Id,
            title = n.TitleEn,
            summary = n.SummaryEn,
            body = n.BodyEn,
            n.Category,
            n.ImageUrl,
            n.PublishedAt,
            n.Source,
            n.ExternalUrl
        },
        _ => new
        {
            n.Id,
            n.TitleAr,
            n.TitleEn,
            n.SummaryAr,
            n.SummaryEn,
            n.BodyAr,
            n.BodyEn,
            n.Category,
            n.ImageUrl,
            n.PublishedAt,
            n.Source,
            n.ExternalUrl
        }
    };
}
