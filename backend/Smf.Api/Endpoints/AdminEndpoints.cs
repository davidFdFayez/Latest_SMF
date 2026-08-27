using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

public static class AdminEndpoints
{
    public static void MapAdminEndpoints(this IEndpointRouteBuilder app)
    {
        var admin = app.MapGroup("/api/admin").WithTags("Admin").RequireAuthorization();

        MapDashboard(admin);
        MapNewsAdmin(admin);
        MapEventsAdmin(admin);
        MapResultsAdmin(admin);
        MapPagesAdmin(admin);
        MapRegistrationsAdmin(admin);
        MapContactAdmin(admin);
        MapWhistleblowerAdmin(admin);
        MapSettingsAdmin(admin);
        MapNotificationsAdmin(admin);
        MapRolesAdmin(admin);
    }

    private static void MapRolesAdmin(RouteGroupBuilder admin)
    {
        admin.MapGet("/roles", () => Results.Ok(
            AdminRoles.Definitions.Select(r => new
            {
                key = r.Key,
                nameAr = r.NameAr,
                nameEn = r.NameEn,
                descriptionAr = r.DescriptionAr,
                descriptionEn = r.DescriptionEn,
                grants = r.Grants,
            })));
    }

    private static void MapNotificationsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/notification-templates");

        group.MapGet("/", () => Results.Ok(
            NotificationTemplates.All.Select(t => new
            {
                key = t.Key,
                subjectAr = t.SubjectAr,
                bodyAr = t.BodyAr,
                smsAr = t.SmsAr,
                subjectEn = t.SubjectEn,
                bodyEn = t.BodyEn,
                smsEn = t.SmsEn,
            })));

        // Preview a template with real values substituted, so staff can check
        // the wording before a status change actually sends it.
        group.MapPost("/{key}/preview", (string key, Dictionary<string, string?> values) =>
        {
            var template = NotificationTemplates.Get(key);
            if (template is null) return Results.NotFound(new { message = $"Unknown template '{key}'." });

            return Results.Ok(new
            {
                subjectAr = NotificationTemplates.Render(template.SubjectAr, values),
                bodyAr = NotificationTemplates.Render(template.BodyAr, values),
                smsAr = NotificationTemplates.Render(template.SmsAr, values),
                subjectEn = NotificationTemplates.Render(template.SubjectEn, values),
                bodyEn = NotificationTemplates.Render(template.BodyEn, values),
                smsEn = NotificationTemplates.Render(template.SmsEn, values),
            });
        });
    }

    private static void MapDashboard(RouteGroupBuilder admin)
    {
        admin.MapGet("/dashboard", async (SmfDbContext db) =>
        {
            return Results.Ok(new
            {
                newsCount = await db.NewsArticles.CountAsync(),
                publishedNewsCount = await db.NewsArticles.CountAsync(n => n.IsPublished),
                eventsCount = await db.Events.CountAsync(),
                upcomingEventsCount = await db.Events.CountAsync(e => e.StartDate >= DateTime.UtcNow),
                resultsCount = await db.Results.CountAsync(),
                goldCount = await db.Results.CountAsync(r => r.Medal == "gold"),
                silverCount = await db.Results.CountAsync(r => r.Medal == "silver"),
                bronzeCount = await db.Results.CountAsync(r => r.Medal == "bronze"),
                registrationsCount = await db.Registrations.CountAsync(),
                pendingRegistrationsCount = await db.Registrations.CountAsync(r => RegistrationStatuses.Open.Contains(r.Status)),
                contactMessagesCount = await db.ContactMessages.CountAsync(),
                unreadContactMessagesCount = await db.ContactMessages.CountAsync(c => !c.IsRead),
                whistleblowerReportsCount = await db.WhistleblowerReports.CountAsync(),
                unreviewedWhistleblowerCount = await db.WhistleblowerReports.CountAsync(w => !w.IsReviewed),
                pagesCount = await db.Pages.CountAsync()
            });
        });
    }

    private static void MapNewsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/news");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.NewsArticles.AsNoTracking().OrderByDescending(n => n.PublishedAt).ToListAsync()));

        group.MapGet("/{id:int}", async (int id, SmfDbContext db) =>
            await db.NewsArticles.FindAsync(id) is { } item ? Results.Ok(item) : Results.NotFound());

        group.MapPost("/", async (NewsUpsertRequest request, SmfDbContext db) =>
        {
            var entity = new NewsArticle
            {
                TitleAr = request.TitleAr,
                TitleEn = request.TitleEn,
                SummaryAr = request.SummaryAr,
                SummaryEn = request.SummaryEn,
                BodyAr = request.BodyAr,
                BodyEn = request.BodyEn,
                Category = request.Category,
                ImageUrl = request.ImageUrl,
                PublishedAt = request.PublishedAt ?? DateTime.UtcNow,
                IsPublished = request.IsPublished,
                Source = request.Source,
                ExternalUrl = request.ExternalUrl
            };
            db.NewsArticles.Add(entity);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/news/{entity.Id}", entity);
        });

        group.MapPut("/{id:int}", async (int id, NewsUpsertRequest request, SmfDbContext db) =>
        {
            var entity = await db.NewsArticles.FindAsync(id);
            if (entity is null) return Results.NotFound();

            entity.TitleAr = request.TitleAr;
            entity.TitleEn = request.TitleEn;
            entity.SummaryAr = request.SummaryAr;
            entity.SummaryEn = request.SummaryEn;
            entity.BodyAr = request.BodyAr;
            entity.BodyEn = request.BodyEn;
            entity.Category = request.Category;
            entity.ImageUrl = request.ImageUrl;
            entity.PublishedAt = request.PublishedAt ?? entity.PublishedAt;
            entity.IsPublished = request.IsPublished;
            entity.Source = request.Source;
            entity.ExternalUrl = request.ExternalUrl;

            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, SmfDbContext db) =>
        {
            var entity = await db.NewsArticles.FindAsync(id);
            if (entity is null) return Results.NotFound();
            db.NewsArticles.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapEventsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/events");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.Events.AsNoTracking().OrderBy(e => e.StartDate).ToListAsync()));

        group.MapGet("/{id:int}", async (int id, SmfDbContext db) =>
            await db.Events.FindAsync(id) is { } item ? Results.Ok(item) : Results.NotFound());

        group.MapPost("/", async (EventUpsertRequest request, SmfDbContext db) =>
        {
            var entity = new EventItem
            {
                TitleAr = request.TitleAr,
                TitleEn = request.TitleEn,
                DescriptionAr = request.DescriptionAr,
                DescriptionEn = request.DescriptionEn,
                Category = request.Category,
                StartDate = request.StartDate,
                EndDate = request.EndDate,
                LocationAr = request.LocationAr,
                LocationEn = request.LocationEn,
                Status = request.Status,
                IsPublished = request.IsPublished
            };
            db.Events.Add(entity);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/events/{entity.Id}", entity);
        });

        group.MapPut("/{id:int}", async (int id, EventUpsertRequest request, SmfDbContext db) =>
        {
            var entity = await db.Events.FindAsync(id);
            if (entity is null) return Results.NotFound();

            entity.TitleAr = request.TitleAr;
            entity.TitleEn = request.TitleEn;
            entity.DescriptionAr = request.DescriptionAr;
            entity.DescriptionEn = request.DescriptionEn;
            entity.Category = request.Category;
            entity.StartDate = request.StartDate;
            entity.EndDate = request.EndDate;
            entity.LocationAr = request.LocationAr;
            entity.LocationEn = request.LocationEn;
            entity.Status = request.Status;
            entity.IsPublished = request.IsPublished;

            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, SmfDbContext db) =>
        {
            var entity = await db.Events.FindAsync(id);
            if (entity is null) return Results.NotFound();
            db.Events.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapResultsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/results");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.Results.AsNoTracking().OrderByDescending(r => r.Year).ToListAsync()));

        group.MapGet("/{id:int}", async (int id, SmfDbContext db) =>
            await db.Results.FindAsync(id) is { } item ? Results.Ok(item) : Results.NotFound());

        group.MapPost("/", async (ResultUpsertRequest request, SmfDbContext db) =>
        {
            var entity = new ResultRecord
            {
                Year = request.Year,
                Athlete = request.Athlete,
                AthleteSlug = request.AthleteSlug,
                Event = request.Event,
                Location = request.Location,
                Category = request.Category,
                Medal = request.Medal.ToLowerInvariant()
            };
            db.Results.Add(entity);
            await db.SaveChangesAsync();
            return Results.Created($"/api/admin/results/{entity.Id}", entity);
        });

        group.MapPut("/{id:int}", async (int id, ResultUpsertRequest request, SmfDbContext db) =>
        {
            var entity = await db.Results.FindAsync(id);
            if (entity is null) return Results.NotFound();

            entity.Year = request.Year;
            entity.Athlete = request.Athlete;
            entity.AthleteSlug = request.AthleteSlug;
            entity.Event = request.Event;
            entity.Location = request.Location;
            entity.Category = request.Category;
            entity.Medal = request.Medal.ToLowerInvariant();

            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, SmfDbContext db) =>
        {
            var entity = await db.Results.FindAsync(id);
            if (entity is null) return Results.NotFound();
            db.Results.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapPagesAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/pages");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.Pages.AsNoTracking().OrderBy(p => p.Slug).ToListAsync()));

        group.MapGet("/{slug}", async (string slug, SmfDbContext db) =>
            await db.Pages.FirstOrDefaultAsync(p => p.Slug == slug) is { } page ? Results.Ok(page) : Results.NotFound());

        group.MapPut("/{slug}", async (string slug, PageUpsertRequest request, SmfDbContext db) =>
        {
            var page = await db.Pages.FirstOrDefaultAsync(p => p.Slug == slug);
            if (page is null)
            {
                page = new PageContent { Slug = slug, ContentJson = request.ContentJson, UpdatedAt = DateTime.UtcNow };
                db.Pages.Add(page);
            }
            else
            {
                page.ContentJson = request.ContentJson;
                page.UpdatedAt = DateTime.UtcNow;
            }

            await db.SaveChangesAsync();
            return Results.Ok(page);
        });

        group.MapDelete("/{slug}", async (string slug, SmfDbContext db) =>
        {
            var page = await db.Pages.FirstOrDefaultAsync(p => p.Slug == slug);
            if (page is null) return Results.NotFound();
            db.Pages.Remove(page);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapRegistrationsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/registrations");

        group.MapGet("/", async (string? type, string? status, SmfDbContext db) =>
        {
            var query = db.Registrations.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(type)) query = query.Where(r => r.Type == type);
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(r => r.Status == status);
            return Results.Ok(await query.OrderByDescending(r => r.CreatedAt).ToListAsync());
        });

        group.MapGet("/{id:int}", async (int id, SmfDbContext db) =>
            await db.Registrations.FindAsync(id) is { } item ? Results.Ok(item) : Results.NotFound());

        group.MapPut("/{id:int}/status", async (int id, RegistrationStatusUpdateRequest request, SmfDbContext db) =>
        {
            var entity = await db.Registrations.FindAsync(id);
            if (entity is null) return Results.NotFound();

            if (!RegistrationStatuses.IsValid(request.Status))
                return Results.BadRequest(new { message = $"Unknown status '{request.Status}'." });

            // Rejection and requests for missing data must tell the applicant why —
            // both statuses drive a notification that quotes the reason back to them.
            if (RegistrationStatuses.RequiresReason(request.Status) && string.IsNullOrWhiteSpace(request.StatusReason))
                return Results.BadRequest(new { message = $"Status '{request.Status}' requires a reason." });

            entity.Status = request.Status;
            entity.StatusReason = request.StatusReason;
            entity.StatusChangedAt = DateTime.UtcNow;

            if (request.InternalNotes is not null) entity.InternalNotes = request.InternalNotes;
            if (request.MembershipNumber is not null) entity.MembershipNumber = request.MembershipNumber;

            if (request.Status == RegistrationStatuses.Approved)
                entity.ApprovedAt = DateTime.UtcNow;

            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        // Serves a document the applicant uploaded with this request. The
        // attachment id must actually be referenced by *this* registration's
        // payload, so a reviewer cannot walk the uploads directory by guessing.
        group.MapGet("/{id:int}/attachments/{attachmentId}", async (
            int id,
            string attachmentId,
            SmfDbContext db,
            RegistrationAttachmentStore store) =>
        {
            var entity = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id);
            if (entity is null) return Results.NotFound();

            if (!RegistrationPayload.AttachmentIds(entity.PayloadJson).Contains(attachmentId))
                return Results.NotFound();

            if (!store.TryResolve(attachmentId, out var path, out var meta))
                return Results.NotFound();

            return Results.File(path, meta.ContentType, meta.FileName);
        });

        // Status vocabulary for the admin UI, so the dashboard never hard-codes it.
        group.MapGet("/statuses", () => Results.Ok(
            RegistrationStatuses.All.Select(s => new
            {
                value = s,
                labelAr = RegistrationStatuses.Labels[s].Ar,
                labelEn = RegistrationStatuses.Labels[s].En,
                requiresReason = RegistrationStatuses.RequiresReason(s),
            })));

        group.MapDelete("/{id:int}", async (int id, SmfDbContext db) =>
        {
            var entity = await db.Registrations.FindAsync(id);
            if (entity is null) return Results.NotFound();
            db.Registrations.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapContactAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/contact-messages");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.ContactMessages.AsNoTracking().OrderByDescending(c => c.CreatedAt).ToListAsync()));

        group.MapPut("/{id:int}/read", async (int id, SmfDbContext db) =>
        {
            var entity = await db.ContactMessages.FindAsync(id);
            if (entity is null) return Results.NotFound();
            entity.IsRead = true;
            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, SmfDbContext db) =>
        {
            var entity = await db.ContactMessages.FindAsync(id);
            if (entity is null) return Results.NotFound();
            db.ContactMessages.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapWhistleblowerAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/whistleblower");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.WhistleblowerReports.AsNoTracking().OrderByDescending(w => w.CreatedAt).ToListAsync()));

        group.MapPut("/{id:int}/review", async (int id, SmfDbContext db) =>
        {
            var entity = await db.WhistleblowerReports.FindAsync(id);
            if (entity is null) return Results.NotFound();
            entity.IsReviewed = true;
            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, SmfDbContext db) =>
        {
            var entity = await db.WhistleblowerReports.FindAsync(id);
            if (entity is null) return Results.NotFound();
            db.WhistleblowerReports.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapSettingsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/settings");

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.SiteSettings.AsNoTracking().OrderBy(s => s.Key).ToListAsync()));

        group.MapPut("/", async (SettingUpsertRequest request, SmfDbContext db) =>
        {
            var setting = await db.SiteSettings.FirstOrDefaultAsync(s => s.Key == request.Key);
            if (setting is null)
            {
                setting = new SiteSetting { Key = request.Key, ValueAr = request.ValueAr, ValueEn = request.ValueEn };
                db.SiteSettings.Add(setting);
            }
            else
            {
                setting.ValueAr = request.ValueAr;
                setting.ValueEn = request.ValueEn;
            }

            await db.SaveChangesAsync();
            return Results.Ok(setting);
        });
    }
}
