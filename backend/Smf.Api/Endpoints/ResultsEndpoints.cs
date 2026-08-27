using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;

namespace Smf.Api.Endpoints;

public static class ResultsEndpoints
{
    public static void MapResultsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/results").WithTags("Results");

        group.MapGet("/", async (int? year, string? @event, string? medal, string? search, SmfDbContext db) =>
        {
            var query = db.Results.AsNoTracking().AsQueryable();

            if (year.HasValue)
                query = query.Where(r => r.Year == year.Value);

            if (!string.IsNullOrWhiteSpace(@event))
                query = query.Where(r => r.Event.Contains(@event));

            if (!string.IsNullOrWhiteSpace(medal))
                query = query.Where(r => r.Medal == medal.ToLower());

            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.ToLower();
                query = query.Where(r =>
                    r.Athlete.ToLower().Contains(term) ||
                    r.Category.ToLower().Contains(term) ||
                    r.Event.ToLower().Contains(term) ||
                    r.Location.ToLower().Contains(term));
            }

            var items = await query
                .OrderByDescending(r => r.Year)
                .ThenBy(r => r.Medal == "gold" ? 0 : r.Medal == "silver" ? 1 : 2)
                .ToListAsync();

            return Results.Ok(items);
        });

        group.MapGet("/stats", async (SmfDbContext db) =>
        {
            var gold = await db.Results.CountAsync(r => r.Medal == "gold");
            var silver = await db.Results.CountAsync(r => r.Medal == "silver");
            var bronze = await db.Results.CountAsync(r => r.Medal == "bronze");

            var byYear = await db.Results
                .GroupBy(r => r.Year)
                .Select(g => new
                {
                    year = g.Key,
                    gold = g.Count(r => r.Medal == "gold"),
                    silver = g.Count(r => r.Medal == "silver"),
                    bronze = g.Count(r => r.Medal == "bronze"),
                    total = g.Count()
                })
                .OrderBy(x => x.year)
                .ToListAsync();

            return Results.Ok(new
            {
                gold,
                silver,
                bronze,
                total = gold + silver + bronze,
                byYear
            });
        });
    }
}
