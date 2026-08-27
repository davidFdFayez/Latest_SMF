using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Endpoints;

public static class EventsEndpoints
{
    public static void MapEventsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/events").WithTags("Events");

        group.MapGet("/", async (string? lang, string? category, SmfDbContext db) =>
        {
            var query = db.Events.AsNoTracking().Where(e => e.IsPublished);

            if (!string.IsNullOrWhiteSpace(category))
                query = query.Where(e => e.Category == category);

            var items = await query.OrderBy(e => e.StartDate).ToListAsync();

            return Results.Ok(items.Select(e => Project(e, lang)));
        });

        group.MapGet("/{id:int}", async (int id, string? lang, SmfDbContext db) =>
        {
            var item = await db.Events.AsNoTracking()
                .FirstOrDefaultAsync(e => e.Id == id && e.IsPublished);
            return item is null ? Results.NotFound() : Results.Ok(Project(item, lang));
        });
    }

    private static object Project(EventItem e, string? lang) => lang switch
    {
        "ar" => new
        {
            e.Id,
            title = e.TitleAr,
            description = e.DescriptionAr,
            e.Category,
            e.StartDate,
            e.EndDate,
            location = e.LocationAr,
            e.Status
        },
        "en" => new
        {
            e.Id,
            title = e.TitleEn,
            description = e.DescriptionEn,
            e.Category,
            e.StartDate,
            e.EndDate,
            location = e.LocationEn,
            e.Status
        },
        _ => new
        {
            e.Id,
            e.TitleAr,
            e.TitleEn,
            e.DescriptionAr,
            e.DescriptionEn,
            e.Category,
            e.StartDate,
            e.EndDate,
            e.LocationAr,
            e.LocationEn,
            e.Status
        }
    };
}
