using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;

namespace Smf.Api.Endpoints;

public static class SettingsEndpoints
{
    public static void MapSettingsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/settings", async (SmfDbContext db) =>
        {
            var settings = await db.SiteSettings.AsNoTracking().ToListAsync();
            var dict = settings.ToDictionary(s => s.Key, s => new { ar = s.ValueAr, en = s.ValueEn });
            return Results.Ok(dict);
        }).WithTags("Settings");
    }
}
