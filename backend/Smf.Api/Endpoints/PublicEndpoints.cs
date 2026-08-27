using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Endpoints;

public static class PublicEndpoints
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static void MapPublicEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api");

        api.MapGet("/pages/{slug}", async (string slug, string? lang, SmfDbContext db) =>
        {
            var page = await db.Pages.AsNoTracking().FirstOrDefaultAsync(p => p.Slug == slug);
            if (page is null) return Results.NotFound(new { message = $"Page '{slug}' not found." });

            object? content = null;
            try { content = JsonSerializer.Deserialize<JsonElement>(page.ContentJson); }
            catch { content = page.ContentJson; }

            return Results.Ok(new
            {
                page.Id,
                page.Slug,
                content,
                contentJson = page.ContentJson,
                page.UpdatedAt,
                lang = string.IsNullOrWhiteSpace(lang) ? "ar" : lang
            });
        });

        api.MapGet("/news", async (string? lang, string? category, int? page, int? pageSize, SmfDbContext db) =>
        {
            var p = Math.Max(1, page ?? 1);
            var size = Math.Clamp(pageSize ?? 10, 1, 50);
            var q = db.NewsArticles.AsNoTracking().Where(n => n.IsPublished);
            if (!string.IsNullOrWhiteSpace(category))
                q = q.Where(n => n.Category == category);

            var total = await q.CountAsync();
            var items = await q.OrderByDescending(n => n.PublishedAt)
                .Skip((p - 1) * size)
                .Take(size)
                .Select(n => MapNews(n, lang))
                .ToListAsync();

            return Results.Ok(new { total, page = p, pageSize = size, items });
        });

        api.MapGet("/news/{id:int}", async (int id, string? lang, SmfDbContext db) =>
        {
            var n = await db.NewsArticles.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.IsPublished);
            return n is null ? Results.NotFound() : Results.Ok(MapNewsDetail(n, lang));
        });

        api.MapGet("/events", async (string? lang, string? category, SmfDbContext db) =>
        {
            var q = db.Events.AsNoTracking().Where(e => e.IsPublished);
            if (!string.IsNullOrWhiteSpace(category) && category != "all")
                q = q.Where(e => e.Category == category);

            var items = await q.OrderBy(e => e.StartDate)
                .Select(e => MapEvent(e, lang))
                .ToListAsync();

            return Results.Ok(items);
        });

        api.MapGet("/results", async (int? year, string? @event, string? medal, string? search, SmfDbContext db) =>
        {
            var q = db.Results.AsNoTracking().AsQueryable();
            if (year.HasValue) q = q.Where(r => r.Year == year.Value);
            if (!string.IsNullOrWhiteSpace(@event)) q = q.Where(r => r.Event == @event);
            if (!string.IsNullOrWhiteSpace(medal)) q = q.Where(r => r.Medal == medal.ToLower());
            if (!string.IsNullOrWhiteSpace(search))
            {
                var s = search.Trim().ToLower();
                q = q.Where(r =>
                    r.Athlete.ToLower().Contains(s) ||
                    r.AthleteSlug.ToLower().Contains(s) ||
                    r.Event.ToLower().Contains(s) ||
                    r.Category.ToLower().Contains(s));
            }

            var items = await q.OrderByDescending(r => r.Year).ThenBy(r => r.Athlete).ToListAsync();
            return Results.Ok(items);
        });

        api.MapGet("/results/stats", async (SmfDbContext db) =>
        {
            var all = await db.Results.AsNoTracking().ToListAsync();
            return Results.Ok(new
            {
                gold = all.Count(r => r.Medal == "gold"),
                silver = all.Count(r => r.Medal == "silver"),
                bronze = all.Count(r => r.Medal == "bronze"),
                total = all.Count,
                championships = all.Select(r => r.Event).Distinct().Count()
            });
        });

        api.MapGet("/settings", async (SmfDbContext db) =>
        {
            var settings = await db.SiteSettings.AsNoTracking().ToListAsync();
            return Results.Ok(settings.ToDictionary(s => s.Key, s => new { s.ValueAr, s.ValueEn }));
        });

        api.MapPost("/registrations", async (RegistrationRequest req, SmfDbContext db) =>
        {
            var type = (req.Type ?? "athlete").Trim().ToLowerInvariant();
            var allowed = new[] { "athlete", "club", "coach", "official" };
            if (!allowed.Contains(type))
                return Results.BadRequest(new { message = "Invalid registration type." });

            // Reference prefixes published on the registration pages: SMF-A / SMF-C / SMF-T / SMF-O.
            var prefix = type switch
            {
                "athlete" => "SMF-A",
                "club" => "SMF-C",
                "coach" => "SMF-T",
                "official" => "SMF-O",
                _ => "SMF-R"
            };

            var reference = $"{prefix}-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}";
            var entity = new Registration
            {
                Type = type,
                PayloadJson = req.Payload is null
                    ? "{}"
                    : JsonSerializer.Serialize(req.Payload, JsonOpts),
                ReferenceNumber = reference,
                Status = RegistrationStatuses.New,
                CreatedAt = DateTime.UtcNow
            };
            db.Registrations.Add(entity);
            await db.SaveChangesAsync();
            return Results.Ok(new { referenceNumber = reference, id = entity.Id });
        });

        api.MapPost("/contact", async (ContactRequest req, SmfDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Name) || string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Message))
                return Results.BadRequest(new { message = "Name, email and message are required." });

            db.ContactMessages.Add(new ContactMessage
            {
                Name = req.Name.Trim(),
                Email = req.Email.Trim(),
                Phone = req.Phone,
                Subject = req.Subject ?? string.Empty,
                Message = req.Message.Trim(),
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { message = "received" });
        });

        api.MapPost("/whistleblower", async (WhistleblowerRequest req, SmfDbContext db) =>
        {
            if (string.IsNullOrWhiteSpace(req.Description))
                return Results.BadRequest(new { message = "Description is required." });

            var reference = $"SMF-WB-{DateTime.UtcNow:yyyyMMdd}-{Random.Shared.Next(1000, 9999)}";
            db.WhistleblowerReports.Add(new WhistleblowerReport
            {
                Description = req.Description.Trim(),
                OptionalContact = req.OptionalContact,
                ReferenceNumber = reference,
                CreatedAt = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
            return Results.Ok(new { referenceNumber = reference });
        });
    }

    private static object MapNews(NewsArticle n, string? lang)
    {
        var ar = string.IsNullOrWhiteSpace(lang) || lang == "ar";
        return new
        {
            n.Id,
            title = ar ? n.TitleAr : n.TitleEn,
            titleAr = n.TitleAr,
            titleEn = n.TitleEn,
            summary = ar ? n.SummaryAr : n.SummaryEn,
            summaryAr = n.SummaryAr,
            summaryEn = n.SummaryEn,
            n.Category,
            n.ImageUrl,
            n.PublishedAt,
            n.Source,
            n.ExternalUrl
        };
    }

    private static object MapNewsDetail(NewsArticle n, string? lang)
    {
        var ar = string.IsNullOrWhiteSpace(lang) || lang == "ar";
        return new
        {
            n.Id,
            title = ar ? n.TitleAr : n.TitleEn,
            titleAr = n.TitleAr,
            titleEn = n.TitleEn,
            summary = ar ? n.SummaryAr : n.SummaryEn,
            body = ar ? n.BodyAr : n.BodyEn,
            bodyAr = n.BodyAr,
            bodyEn = n.BodyEn,
            n.Category,
            n.ImageUrl,
            n.PublishedAt,
            n.Source,
            n.ExternalUrl
        };
    }

    private static object MapEvent(EventItem e, string? lang)
    {
        var ar = string.IsNullOrWhiteSpace(lang) || lang == "ar";
        return new
        {
            e.Id,
            title = ar ? e.TitleAr : e.TitleEn,
            titleAr = e.TitleAr,
            titleEn = e.TitleEn,
            description = ar ? e.DescriptionAr : e.DescriptionEn,
            e.Category,
            e.StartDate,
            e.EndDate,
            location = ar ? e.LocationAr : e.LocationEn,
            locationAr = e.LocationAr,
            locationEn = e.LocationEn,
            e.Status
        };
    }

    public record RegistrationRequest(string? Type, object? Payload);
    public record ContactRequest(string Name, string Email, string? Phone, string? Subject, string Message);
    public record WhistleblowerRequest(string Description, string? OptionalContact);
}
