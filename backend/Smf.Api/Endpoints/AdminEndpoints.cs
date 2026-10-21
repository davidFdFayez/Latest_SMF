using System.Security.Claims;
using System.Text;
using System.Text.Json;
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
        admin.MapContentAdmin();
        admin.MapMediaAdmin();
        MapNotificationDeliveryAdmin(admin);
        MapAuditAdmin(admin);
        MapRegistrationsAdmin(admin);
        MapMembersAdmin(admin);
        admin.MapTournamentAdmin();
        admin.MapMedicalAdmin();
        admin.MapMemberAccountsAdmin();
        MapContactAdmin(admin);
        MapWhistleblowerAdmin(admin);
        MapSettingsAdmin(admin);
        MapNotificationsAdmin(admin);
        admin.MapAccessAdmin();
    }

    private static void MapNotificationsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/notification-templates").RequirePermission(AdminPermissions.Settings);

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

    /// <summary>
    /// Whether notifications can actually leave the server, and what has
    /// happened recently. Without this the console cannot tell "the applicant
    /// was emailed" from "the message is sitting in a file on the server".
    /// </summary>
    private static void MapNotificationDeliveryAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/notifications")
            .RequirePermission(AdminPermissions.Settings, AdminPermissions.Users);

        group.MapGet("/status", async (
            NotificationDispatcher notifications,
            SmfDbContext db,
            CancellationToken cancellationToken) =>
        {
            var since = DateTime.UtcNow.AddDays(-30);

            var recent = await db.NotificationLog.AsNoTracking()
                .Where(n => n.CreatedAt >= since)
                .GroupBy(n => new { n.Channel, n.Status })
                .Select(g => new { g.Key.Channel, g.Key.Status, count = g.Count() })
                .ToListAsync(cancellationToken);

            var lastFailure = await db.NotificationLog.AsNoTracking()
                .Where(n => n.Status == NotificationStatuses.Failed)
                .OrderByDescending(n => n.CreatedAt)
                .Select(n => new { n.CreatedAt, n.Channel, n.Detail })
                .FirstOrDefaultAsync(cancellationToken);

            return Results.Ok(new
            {
                email = new { configured = notifications.EmailConfigured, outboxPath = notifications.EmailOutboxPath },
                sms = new { configured = notifications.SmsConfigured, outboxPath = notifications.SmsOutboxPath },
                last30Days = recent,
                lastFailure,
            });
        });

        group.MapGet("/", async (string? status, int? take, SmfDbContext db, CancellationToken cancellationToken) =>
        {
            var query = db.NotificationLog.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(n => n.Status == status);

            var items = await query
                .OrderByDescending(n => n.CreatedAt)
                .Take(Math.Clamp(take ?? 100, 1, 500))
                .ToListAsync(cancellationToken);

            return Results.Ok(items);
        });
    }

    /// <summary>
    /// The audit trail across every area — memberships, users, roles, website
    /// content, news, and events — so an administrator can answer "who changed
    /// this?" without opening the record it happened to.
    /// </summary>
    private static void MapAuditAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/audit")
            .RequirePermission(AdminPermissions.Users, AdminPermissions.Permissions);

        group.MapGet("/", async (
            string? entityType,
            string? action,
            string? actor,
            string? search,
            int? page,
            int? pageSize,
            SmfDbContext db,
            CancellationToken cancellationToken) =>
        {
            var currentPage = Math.Max(1, page ?? 1);
            var size = Math.Clamp(pageSize ?? 50, 1, 200);

            var query = db.AuditLog.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(entityType)) query = query.Where(e => e.EntityType == entityType);
            if (!string.IsNullOrWhiteSpace(action)) query = query.Where(e => e.Action == action);
            if (!string.IsNullOrWhiteSpace(actor)) query = query.Where(e => e.ActorName == actor);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim().ToLower();
                query = query.Where(e =>
                    (e.EntityRef != null && e.EntityRef.ToLower().Contains(term))
                    || (e.Details != null && e.Details.ToLower().Contains(term))
                    || e.ActorName.ToLower().Contains(term));
            }

            var total = await query.CountAsync(cancellationToken);
            var items = await query
                .OrderByDescending(e => e.CreatedAt)
                .Skip((currentPage - 1) * size)
                .Take(size)
                .ToListAsync(cancellationToken);

            return Results.Ok(new
            {
                total,
                page = currentPage,
                pageSize = size,
                items,
                entityTypes = await db.AuditLog.AsNoTracking().Select(e => e.EntityType).Distinct().OrderBy(e => e).ToListAsync(cancellationToken),
                actions = await db.AuditLog.AsNoTracking().Select(e => e.Action).Distinct().OrderBy(e => e).ToListAsync(cancellationToken),
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
                unreviewedWhistleblowerCount = await db.WhistleblowerReports.CountAsync(w => !w.IsReviewed)
            });
        });
    }

    private static void MapNewsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/news").RequirePermission(AdminPermissions.News);

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.NewsArticles.AsNoTracking().OrderByDescending(n => n.PublishedAt).ToListAsync()));

        group.MapGet("/{id:int}", async (int id, SmfDbContext db) =>
            await db.NewsArticles.FindAsync(id) is { } item ? Results.Ok(item) : Results.NotFound());

        group.MapPost("/", async (NewsUpsertRequest request, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit) =>
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
                ImageFocus = NewsImageFocus.Clean(request.ImageFocus),
                PublishedAt = request.PublishedAt ?? DateTime.UtcNow,
                IsPublished = request.IsPublished,
                Source = request.Source,
                ExternalUrl = request.ExternalUrl
            };
            db.NewsArticles.Add(entity);
            await db.SaveChangesAsync();

            // The id only exists after the insert, so the entry follows it.
            audit.Write(AdminIdentity.Current(user), AuditActions.NewsCreated, "news", entity.Id, entity.TitleEn);
            await db.SaveChangesAsync();

            return Results.Created($"/api/admin/news/{entity.Id}", entity);
        });

        group.MapPut("/{id:int}", async (int id, NewsUpsertRequest request, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit) =>
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
            entity.ImageFocus = NewsImageFocus.Clean(request.ImageFocus);
            entity.PublishedAt = request.PublishedAt ?? entity.PublishedAt;
            entity.IsPublished = request.IsPublished;
            entity.Source = request.Source;
            entity.ExternalUrl = request.ExternalUrl;

            audit.Write(AdminIdentity.Current(user), AuditActions.NewsUpdated, "news", entity.Id, entity.TitleEn);
            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit) =>
        {
            var entity = await db.NewsArticles.FindAsync(id);
            if (entity is null) return Results.NotFound();

            // Written before the removal so the entry outlives the article.
            audit.Write(AdminIdentity.Current(user), AuditActions.NewsDeleted, "news", entity.Id, entity.TitleEn);
            db.NewsArticles.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapEventsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/events").RequirePermission(AdminPermissions.Events);

        group.MapGet("/", async (SmfDbContext db) =>
            Results.Ok(await db.Events.AsNoTracking().OrderBy(e => e.StartDate).ToListAsync()));

        group.MapGet("/{id:int}", async (int id, SmfDbContext db) =>
            await db.Events.FindAsync(id) is { } item ? Results.Ok(item) : Results.NotFound());

        group.MapPost("/", async (EventUpsertRequest request, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit) =>
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
                IsPublished = request.IsPublished,
                ImageUrl = request.ImageUrl
            };
            db.Events.Add(entity);
            await db.SaveChangesAsync();

            audit.Write(AdminIdentity.Current(user), AuditActions.EventCreated, "event", entity.Id, entity.TitleEn);
            await db.SaveChangesAsync();

            return Results.Created($"/api/admin/events/{entity.Id}", entity);
        });

        group.MapPut("/{id:int}", async (int id, EventUpsertRequest request, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit) =>
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
            entity.ImageUrl = request.ImageUrl;

            audit.Write(AdminIdentity.Current(user), AuditActions.EventUpdated, "event", entity.Id, entity.TitleEn);
            await db.SaveChangesAsync();
            return Results.Ok(entity);
        });

        group.MapDelete("/{id:int}", async (int id, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit) =>
        {
            var entity = await db.Events.FindAsync(id);
            if (entity is null) return Results.NotFound();

            audit.Write(AdminIdentity.Current(user), AuditActions.EventDeleted, "event", entity.Id, entity.TitleEn);
            db.Events.Remove(entity);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });
    }

    private static void MapResultsAdmin(RouteGroupBuilder admin)
    {
        // Medal results are tournament data, so they sit with events (§17).
        var group = admin.MapGroup("/results").RequirePermission(AdminPermissions.Events);

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

    private static void MapRegistrationsAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/registrations");

        // §6 — every read of the register needs عرض. Previously any
        // authenticated admin account, whatever its role, could list and open
        // every application and its attachments.
        group.MapGet("/", async (
            string? type,
            string? status,
            ClaimsPrincipal user,
            SmfDbContext db) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var query = db.Registrations.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(type)) query = query.Where(r => r.Type == type);
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(r => r.Status == status);

            var items = await query.OrderByDescending(r => r.CreatedAt).ToListAsync();
            return Results.Ok(items.Select(Summarise));
        });

        group.MapGet("/{id:int}", async (int id, ClaimsPrincipal user, SmfDbContext db) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            return await db.Registrations.FindAsync(id) is { } item
                ? Results.Ok(Detail(item))
                : Results.NotFound();
        });

        // Every lifecycle rule — permission, allowed transition, mandatory
        // reason, expiry dates, audit entry, applicant notification — lives in
        // MembershipService so none of them can be skipped here.
        group.MapPut("/{id:int}/status", async (
            int id,
            RegistrationStatusUpdateRequest request,
            ClaimsPrincipal user,
            SmfDbContext db,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var entity = await db.Registrations.FindAsync([id], cancellationToken);
            if (entity is null) return Results.NotFound();

            var outcome = await memberships.ChangeStatusAsync(
                entity,
                request.Status,
                AdminIdentity.Current(user),
                request.StatusReason,
                request.InternalNotes,
                request.MembershipNumber,
                cancellationToken);

            return outcome.Ok ? Results.Ok(Detail(entity)) : Problem(outcome);
        });

        // §6 — تعديل. The one §6 action with no endpoint at all until now: the
        // permission was granted to three roles and the operational rules name
        // it explicitly ("تعديل البيانات بعد الاعتماد"), but nothing could
        // actually amend a stored request.
        group.MapPut("/{id:int}", async (
            int id,
            RegistrationEditRequest request,
            ClaimsPrincipal user,
            SmfDbContext db,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var entity = await db.Registrations.FindAsync([id], cancellationToken);
            if (entity is null) return Results.NotFound();

            var outcome = await memberships.EditAsync(
                entity,
                request.Payload,
                request.InternalNotes,
                request.MembershipNumber,
                AdminIdentity.Current(user),
                cancellationToken);

            return outcome.Ok ? Results.Ok(Detail(entity)) : Problem(outcome);
        });

        // §6 — تصدير. Also previously unimplemented despite every role holding
        // the grant. The export carries applicant contact details, so it is
        // permission-gated and every download is recorded in the audit trail.
        group.MapGet("/export", async (
            string? type,
            string? status,
            ClaimsPrincipal user,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.Export)) return Forbid(MembershipRoles.Actions.Export);

            var query = db.Registrations.AsNoTracking().AsQueryable();
            if (!string.IsNullOrWhiteSpace(type)) query = query.Where(r => r.Type == type);
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(r => r.Status == status);

            var items = await query.OrderByDescending(r => r.CreatedAt).ToListAsync(cancellationToken);

            audit.Write(
                actor,
                AuditActions.Exported,
                "registration",
                0,
                details: $"Exported {items.Count} record(s); type={type ?? "all"}, status={status ?? "all"}.");
            await db.SaveChangesAsync(cancellationToken);

            var csv = RegistrationExport.ToCsv(items);

            // A UTF-8 BOM so Excel reads the Arabic columns as Arabic rather
            // than as the machine's ANSI codepage.
            var bytes = new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
            var name = $"smf-memberships-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv";

            return Results.File(bytes, "text/csv; charset=utf-8", name);
        });

        // §6 — إعادة فتح طلب مرفوض أو ملغى. Rejection and cancellation are
        // terminal in the approved lifecycle, so this is a separate, deliberate
        // act: it needs قبول authority and a reason, and it returns the request
        // to review rather than approving it.
        group.MapPost("/{id:int}/reopen", async (
            int id,
            RegistrationReopenRequest request,
            ClaimsPrincipal user,
            SmfDbContext db,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var entity = await db.Registrations.FindAsync([id], cancellationToken);
            if (entity is null) return Results.NotFound();

            var outcome = await memberships.ReopenAsync(
                entity, AdminIdentity.Current(user), request.Reason, cancellationToken);

            return outcome.Ok ? Results.Ok(Detail(entity)) : Problem(outcome);
        });

        // What was sent to the applicant about this request, and what happened
        // to it — including messages held in the outbox because no mail server
        // is configured yet.
        group.MapGet("/{id:int}/notifications", async (
            int id,
            ClaimsPrincipal user,
            SmfDbContext db,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var items = await db.NotificationLog.AsNoTracking()
                .Where(n => n.RegistrationId == id)
                .OrderByDescending(n => n.CreatedAt)
                .Take(200)
                .ToListAsync(cancellationToken);

            return Results.Ok(items.Select(n => new
            {
                n.Id,
                n.Channel,
                n.TemplateKey,
                n.Recipient,
                n.Subject,
                n.Status,
                statusLabelAr = NotificationStatuses.Labels.TryGetValue(n.Status, out var l) ? l.Ar : n.Status,
                statusLabelEn = NotificationStatuses.Labels.TryGetValue(n.Status, out var l2) ? l2.En : n.Status,
                n.Detail,
                n.CreatedAt,
            }));
        });

        // §1 — التجديد عند نهاية مدة العضوية.
        group.MapPost("/{id:int}/renew", async (
            int id,
            ClaimsPrincipal user,
            SmfDbContext db,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var entity = await db.Registrations.FindAsync([id], cancellationToken);
            if (entity is null) return Results.NotFound();

            var outcome = await memberships.RenewAsync(entity, AdminIdentity.Current(user), cancellationToken);
            return outcome.Ok ? Results.Ok(Detail(entity)) : Problem(outcome);
        });

        // The per-request audit trail (P6). Read-only and append-only.
        group.MapGet("/{id:int}/audit", async (int id, ClaimsPrincipal user, SmfDbContext db) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var entries = await db.AuditLog.AsNoTracking()
                .Where(e => e.EntityType == "registration" && e.EntityId == id)
                .OrderByDescending(e => e.CreatedAt)
                .ToListAsync();

            return Results.Ok(entries);
        });

        // Requests whose completion window has run out (§6). Surfaced for the
        // reviewer to chase; nothing is auto-rejected.
        group.MapGet("/overdue", async (ClaimsPrincipal user, MembershipService memberships, CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var items = await memberships.OverdueCompletionsAsync(cancellationToken);
            return Results.Ok(items.Select(Summarise));
        });

        group.MapGet("/due-for-renewal", async (
            int? withinDays,
            ClaimsPrincipal user,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var items = await memberships.DueForRenewalAsync(withinDays ?? 60, cancellationToken);
            return Results.Ok(items.Select(Summarise));
        });

        // Retires memberships whose three-year term has elapsed. Exposed as an
        // endpoint so it can be driven by a scheduler without the API needing
        // one of its own.
        group.MapPost("/expire-lapsed", async (
            ClaimsPrincipal user,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.Suspend)) return Forbid(MembershipRoles.Actions.Suspend);

            var count = await memberships.ExpireLapsedAsync(actor, cancellationToken);
            return Results.Ok(new { expired = count });
        });

        /* BUG-12 — the term changed from three years to one, which only governs
           what is approved from now on. Memberships issued before the change
           still end three years out, so the console reports them and, when
           somebody deliberately asks, moves them onto the current term. Preview
           first: this rewrites when people's memberships run out. */
        group.MapGet("/term-mismatches", async (
            ClaimsPrincipal user,
            MembershipService memberships,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var mismatches = await memberships.FindTermMismatchesAsync(cancellationToken);

            return Results.Ok(new
            {
                total = mismatches.Count,
                items = mismatches.Select(m => new
                {
                    m.Registration.Id,
                    m.Registration.Type,
                    m.Registration.ReferenceNumber,
                    m.Registration.MembershipNumber,
                    m.Registration.ApprovedAt,
                    m.Registration.RenewalCount,
                    currentExpiry = m.From,
                    correctedExpiry = m.To,
                    termYears = MembershipTerms.YearsFor(m.Registration.Type, configuration),
                }),
            });
        });

        group.MapPost("/term-mismatches/realign", async (
            ClaimsPrincipal user,
            MembershipService memberships,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            var changed = await memberships.RealignTermsAsync(actor, cancellationToken);
            return changed < 0
                ? Forbid(MembershipRoles.Actions.Approve)
                : Results.Ok(new { realigned = changed });
        });


        /* ISSUE-03 — the member's card. The console shows the link so it can be
           sent or printed, and can regenerate it, which is the only way to
           revoke a card that has been passed around. */
        group.MapGet("/{id:int}/card", async (
            int id,
            ClaimsPrincipal user,
            SmfDbContext db,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var entity = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (entity is null) return Results.NotFound();

            if (!MembershipCards.IsEligible(entity) || entity.CardToken is null)
            {
                return Results.Ok(new
                {
                    available = false,
                    reason = "A card exists once the membership has been approved.",
                });
            }

            return Results.Ok(new
            {
                available = true,
                url = MembershipCards.Url(entity.CardToken, configuration),
                qrUrl = $"/api/membership-card/{entity.CardToken}/qr.svg",
                card = MembershipCards.Describe(entity, DateTime.UtcNow, configuration),
            });
        });

        group.MapPost("/{id:int}/card/regenerate", async (
            int id,
            ClaimsPrincipal user,
            SmfDbContext db,
            AuditLogger audit,
            IConfiguration configuration,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.Edit))
            {
                await audit.DeniedAsync(actor, MembershipRoles.Actions.Edit, "registration", id, cancellationToken);
                return Forbid(MembershipRoles.Actions.Edit);
            }

            var entity = await db.Registrations.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (entity is null) return Results.NotFound();

            if (!MembershipCards.IsEligible(entity))
                return BadRequest("لا توجد بطاقة قبل اعتماد العضوية.", "A card exists once the membership has been approved.");

            entity.CardToken = MembershipCards.NewToken();
            entity.LastActionBy = actor.Username;

            audit.Registration(actor, AuditActions.CardReissued, entity,
                details: "Previous card link revoked.");
            await db.SaveChangesAsync(cancellationToken);

            return Results.Ok(new
            {
                available = true,
                url = MembershipCards.Url(entity.CardToken, configuration),
                qrUrl = $"/api/membership-card/{entity.CardToken}/qr.svg",
                card = MembershipCards.Describe(entity, DateTime.UtcNow, configuration),
            });
        });

        // Serves a document the applicant uploaded with this request. The
        // attachment id must actually be referenced by *this* registration's
        // payload, so a reviewer cannot walk the uploads directory by guessing.
        group.MapGet("/{id:int}/attachments/{attachmentId}", async (
            int id,
            string attachmentId,
            ClaimsPrincipal user,
            SmfDbContext db,
            AuditLogger audit,
            RegistrationAttachmentStore store,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var entity = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (entity is null) return Results.NotFound();

            if (!RegistrationPayload.AttachmentIds(entity.PayloadJson).Contains(attachmentId))
                return Results.NotFound();

            if (!store.TryResolve(attachmentId, out var path, out var meta))
                return Results.NotFound();

            // Applicant documents are personal data, so who opened which one is
            // part of the audit trail rather than something only the web server
            // log would know.
            audit.Registration(actor, AuditActions.AttachmentViewed, entity, details: attachmentId);
            await db.SaveChangesAsync(cancellationToken);

            return Results.File(path, meta.ContentType, meta.FileName);
        });

        /* BUG-11 — the console could read an applicant's documents but never
           change them, so a licence that arrived by email after submission had
           nowhere to go and a wrong file could not be taken off the record.
           Both actions carry 'edit', and both are audited: these are the
           applicant's identity documents, and who replaced one matters. */
        group.MapPost("/{id:int}/attachments", async (
            int id,
            IFormFile? file,
            string? slot,
            ClaimsPrincipal user,
            SmfDbContext db,
            AuditLogger audit,
            RegistrationAttachmentStore store,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.Edit))
            {
                await audit.DeniedAsync(actor, MembershipRoles.Actions.Edit, "registration", id, cancellationToken);
                return Forbid(MembershipRoles.Actions.Edit);
            }

            var entity = await db.Registrations.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (entity is null) return Results.NotFound();

            if (file is null) return BadRequest("لم يتم إرفاق ملف.", "No file was attached.");

            // The slot is the portal's own field name, so an uploaded document
            // sits in the record exactly where the applicant's would have.
            var target = (slot ?? string.Empty).Trim();
            if (target.Length is 0 or > 60 || !target.All(char.IsAsciiLetterOrDigit))
                return BadRequest("نوع المستند غير صالح.", "That document slot is not valid.");

            var result = await store.SaveAsync(file, cancellationToken);
            if (!result.Succeeded || result.Attachment is null)
                return Results.BadRequest(new { message = result.Error });

            // Replacing a slot leaves the old file with nothing pointing at it.
            var replaced = RegistrationPayload.Attachment(entity.PayloadJson, target);
            entity.PayloadJson = RegistrationPayload.WithAttachment(entity.PayloadJson, target, result.Attachment);
            entity.LastActionBy = actor.Username;
            if (replaced is not null) store.Delete(replaced);

            audit.Registration(
                actor,
                AuditActions.AttachmentAdded,
                entity,
                details: $"{target}: {result.Attachment.FileName}" + (replaced is null ? "" : " (replaced)"));

            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(Detail(entity));
        })
        .DisableAntiforgery();

        group.MapDelete("/{id:int}/attachments/{attachmentId}", async (
            int id,
            string attachmentId,
            ClaimsPrincipal user,
            SmfDbContext db,
            AuditLogger audit,
            RegistrationAttachmentStore store,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.Edit))
            {
                await audit.DeniedAsync(actor, MembershipRoles.Actions.Edit, "registration", id, cancellationToken);
                return Forbid(MembershipRoles.Actions.Edit);
            }

            var entity = await db.Registrations.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (entity is null) return Results.NotFound();

            // Only a document this registration actually references.
            var slot = RegistrationPayload.SlotOf(entity.PayloadJson, attachmentId);
            if (slot is null) return Results.NotFound();

            entity.PayloadJson = RegistrationPayload.WithAttachment(entity.PayloadJson, slot, null);
            entity.LastActionBy = actor.Username;
            store.Delete(attachmentId);

            audit.Registration(actor, AuditActions.AttachmentRemoved, entity, details: $"{slot}: {attachmentId}");

            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(Detail(entity));
        });

        // Status vocabulary for the admin UI, so the dashboard never hard-codes it.
        group.MapGet("/statuses", () => Results.Ok(
            RegistrationStatuses.All.Select(s => new
            {
                value = s,
                labelAr = RegistrationStatuses.Labels[s].Ar,
                labelEn = RegistrationStatuses.Labels[s].En,
                requiresReason = RegistrationStatuses.RequiresReason(s),
                requiredAction = RegistrationStatuses.RequiredAction(s),
                allowedNext = RegistrationStatuses.Transitions.TryGetValue(s, out var next) ? next : [],
            })));

        // §2–§5 — the four tracks with their stages, terms, and fees, so the
        // dashboard renders the federation's actual procedure rather than a
        // copy of it that can drift.
        group.MapGet("/tracks", (IConfiguration configuration) => Results.Ok(
            MembershipTracks.All.Select(t => new
            {
                key = t.Key,
                licenceNameAr = t.LicenceNameAr,
                licenceNameEn = t.LicenceNameEn,
                termYears = MembershipTerms.YearsFor(t.Key, configuration),
                registrationFeeAr = t.RegistrationFeeAr,
                registrationFeeEn = t.RegistrationFeeEn,
                renewalFeeAr = t.RenewalFeeAr,
                renewalFeeEn = t.RenewalFeeEn,
                prerequisitesAr = t.PrerequisitesAr,
                prerequisitesEn = t.PrerequisitesEn,
                stages = t.Stages.Select(s => new
                {
                    order = s.Order,
                    nameAr = s.NameAr,
                    nameEn = s.NameEn,
                    ownerAr = s.OwnerAr,
                    ownerEn = s.OwnerEn,
                    actionAr = s.ActionAr,
                    actionEn = s.ActionEn,
                    outcomeAr = s.OutcomeAr,
                    outcomeEn = s.OutcomeEn,
                    status = s.Status,
                }),
            })));

        // What the signed-in user may do, so the UI can hide controls the API
        // would refuse. Presentation only — the API always re-checks.
        group.MapGet("/permissions", (ClaimsPrincipal user) =>
        {
            var actor = AdminIdentity.Current(user);
            return Results.Ok(new
            {
                roles = actor.RoleKeys,
                grants = actor.Grants,
                actions = MembershipRoles.Actions.All.Select(a => new
                {
                    value = a,
                    labelAr = MembershipRoles.Actions.Labels[a].Ar,
                    labelEn = MembershipRoles.Actions.Labels[a].En,
                    allowed = actor.Can(a),
                }),
            });
        });

        // Deleting an application destroys the evidence behind a decision, so it
        // sits behind تعليق/إلغاء rather than being available to any reviewer.
        group.MapDelete("/{id:int}", async (
            int id,
            ClaimsPrincipal user,
            SmfDbContext db,
            AuditLogger audit,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.Suspend)) return Forbid(MembershipRoles.Actions.Suspend);

            var entity = await db.Registrations.FindAsync([id], cancellationToken);
            if (entity is null) return Results.NotFound();

            // Written before the removal so the entry survives it.
            audit.Registration(actor, AuditActions.Deleted, entity, entity.Status, null, entity.ReferenceNumber);
            db.Registrations.Remove(entity);
            await db.SaveChangesAsync(cancellationToken);

            return Results.NoContent();
        });
    }

    /// <summary>403 in the bilingual shape the admin console displays.</summary>
    /// <summary>
    /// ISSUE-03 — beneficiaries as people and clubs rather than as paperwork.
    ///
    /// The console could only reach an athlete, coach, referee or club through
    /// the application form they once submitted, so somebody who had applied
    /// twice appeared twice and had no single record. These two endpoints serve
    /// a directory of beneficiaries and one profile each, assembled from the
    /// registrations rather than stored separately, so a profile can never
    /// disagree with the applications behind it.
    /// </summary>
    private static void MapMembersAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/members");

        group.MapGet("/", async (
            string? type,
            string? search,
            string? status,
            ClaimsPrincipal user,
            SmfDbContext db,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var query = db.Registrations.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(type)) query = query.Where(r => r.Type == type);

            var profiles = MemberProfiles.From(await query.ToListAsync(cancellationToken));

            if (!string.IsNullOrWhiteSpace(status))
            {
                profiles = status == "active"
                    ? profiles.Where(p => p.Current.Status == RegistrationStatuses.Approved
                                          && !p.Current.IsExpired(DateTime.UtcNow)).ToList()
                    : profiles.Where(p => p.Current.Status == status).ToList();
            }

            var rows = profiles.Select(ProfileRow).ToList();

            // Matching happens here because the name and contact details live
            // inside the stored JSON, which SQLite cannot search usefully.
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                rows = rows
                    .Where(row => row.haystack.Contains(term, StringComparison.OrdinalIgnoreCase))
                    .ToList();
            }

            return Results.Ok(new
            {
                total = rows.Count,
                items = rows.Select(row => row.item),
            });
        });

        group.MapGet("/{id:int}", async (
            int id,
            ClaimsPrincipal user,
            SmfDbContext db,
            CancellationToken cancellationToken) =>
        {
            var actor = AdminIdentity.Current(user);
            if (!actor.Can(MembershipRoles.Actions.View)) return Forbid(MembershipRoles.Actions.View);

            var anchor = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
            if (anchor is null) return Results.NotFound();

            var identity = MemberProfiles.IdentityOf(anchor);
            if (identity is null)
            {
                // No identifying value in the payload, so this application is
                // the whole profile: show it on its own rather than 404.
                return Results.Ok(ProfileDetail(new MemberProfiles.Profile(
                    anchor.Id, anchor.Type, string.Empty, anchor, [anchor])));
            }

            var siblings = await db.Registrations.AsNoTracking()
                .Where(r => r.Type == anchor.Type)
                .ToListAsync(cancellationToken);

            var profile = MemberProfiles.From(siblings)
                .FirstOrDefault(p => string.Equals(p.IdentityKey, identity, StringComparison.OrdinalIgnoreCase));

            return profile is null ? Results.NotFound() : Results.Ok(ProfileDetail(profile));
        });
    }

    /// <summary>One row of the beneficiary directory, with the text it is searched on.</summary>
    private static (object item, string haystack) ProfileRow(MemberProfiles.Profile profile)
    {
        var current = profile.Current;
        var now = DateTime.UtcNow;
        var (nameAr, nameEn, email, phone) = Identify(current);

        var item = new
        {
            id = profile.Id,
            profile.Type,
            nameAr,
            nameEn,
            email,
            phone,
            current.MembershipNumber,
            current.ReferenceNumber,
            current.Status,
            statusLabelEn = RegistrationStatuses.Labels.TryGetValue(current.Status, out var l) ? l.En : current.Status,
            current.ApprovedAt,
            current.ExpiresAt,
            isExpired = current.IsExpired(now),
            daysUntilExpiry = current.DaysRemaining(now),
            applications = profile.History.Count,
            current.RenewalCount,
        };

        var haystack = string.Join(' ', new[]
        {
            nameAr, nameEn, email, phone,
            current.MembershipNumber, current.ReferenceNumber, profile.IdentityKey,
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return (item, haystack);
    }

    /// <summary>The profile page: the current record, plus every application behind it.</summary>
    private static object ProfileDetail(MemberProfiles.Profile profile)
    {
        var current = profile.Current;
        var (nameAr, nameEn, email, phone) = Identify(current);

        JsonElement payload;
        try
        {
            payload = JsonDocument.Parse(current.PayloadJson).RootElement;
        }
        catch (JsonException)
        {
            payload = default;
        }

        string? Field(params string[] names) =>
            payload.ValueKind == JsonValueKind.Object ? RegistrationPayload.FirstString(payload, names) : null;

        var category = Field("athleteCategory");
        var (categoryAr, categoryEn) = CompetitionCategories.Label(category);

        return new
        {
            id = profile.Id,
            profile.Type,
            nameAr,
            nameEn,
            email,
            phone,
            identity = profile.IdentityKey,
            nationality = Field("nationality"),
            dateOfBirth = Field("dateOfBirth"),
            gender = Field("gender"),
            region = Field("region"),
            city = Field("city"),

            // What this beneficiary is, in their own track's terms.
            competitionCategory = category is null ? null : new { value = category, ar = categoryAr, en = categoryEn },
            competitionTrack = Field("competitionTrack"),
            refereeGrade = Field("refereeGrade"),
            entityType = Field("entityType"),
            clubName = Field("clubName"),

            membership = Summarise(current),
            track = MembershipTracks.Get(current.Type) is { } t
                ? new { t.Key, t.LicenceNameAr, t.LicenceNameEn, t.TermYears }
                : null,

            // Every application this beneficiary has made, newest first, so the
            // profile is the way into the paperwork rather than a replacement
            // for it.
            applications = profile.History.Select(r => new
            {
                r.Id,
                r.ReferenceNumber,
                r.Status,
                statusLabelEn = RegistrationStatuses.Labels.TryGetValue(r.Status, out var l) ? l.En : r.Status,
                r.CreatedAt,
                r.ApprovedAt,
                r.ExpiresAt,
                r.MembershipNumber,
                isCurrent = r.Id == current.Id,
            }),

            documents = RegistrationPayload.AttachmentsOf(current.PayloadJson),
        };
    }

    /// <summary>Name and contact details, read out of the stored payload.</summary>
    private static (string? NameAr, string? NameEn, string? Email, string? Phone) Identify(Registration registration)
    {
        try
        {
            var payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
            return (
                RegistrationPayload.DisplayName(payload, arabic: true),
                RegistrationPayload.DisplayName(payload, arabic: false),
                RegistrationPayload.FirstString(payload, "email", "applicantEmail", "officialEmail"),
                RegistrationPayload.FirstString(payload, "phone", "mobile", "applicantPhone", "officialPhone"));
        }
        catch (JsonException)
        {
            return (null, null, null, null);
        }
    }

    private static IResult Forbid(string action) => Results.Json(new
    {
        message = "لا تملك صلاحية تنفيذ هذا الإجراء. / You do not have permission for this action.",
        messageAr = "لا تملك صلاحية تنفيذ هذا الإجراء على طلبات العضوية.",
        messageEn = $"Your role does not grant '{action}' on membership requests.",
        requiredAction = action,
    }, statusCode: StatusCodes.Status403Forbidden);

    /// <summary>A bilingual 400, in the shape every other endpoint answers with.</summary>
    private static IResult BadRequest(string ar, string en) => Results.Json(new
    {
        message = $"{ar} / {en}",
        messageAr = ar,
        messageEn = en,
    }, statusCode: StatusCodes.Status400BadRequest);

    private static IResult Problem(MembershipService.Outcome outcome) => Results.Json(new
    {
        message = $"{outcome.MessageAr} / {outcome.MessageEn}",
        messageAr = outcome.MessageAr,
        messageEn = outcome.MessageEn,
    }, statusCode: outcome.Status);

    /// <summary>
    /// List projection. The stored payload holds national IDs, guardian
    /// details, and contact numbers, so it is deliberately left out of the list
    /// view — a reviewer scanning the queue has no need of it, and it keeps the
    /// bulk PII behind the per-record fetch.
    /// </summary>
    private static object Summarise(Registration r)
    {
        var now = DateTime.UtcNow;
        var track = MembershipTracks.Get(r.Type);

        // Enough to triage the queue — who applied and how to reach them — and
        // no more. National ID, date of birth, and guardian details stay behind
        // the per-record fetch.
        string? name = null, contactEmail = null, contactPhone = null;
        try
        {
            var payload = JsonDocument.Parse(r.PayloadJson).RootElement;
            name = RegistrationPayload.DisplayName(payload, arabic: true)
                   ?? RegistrationPayload.DisplayName(payload, arabic: false);
            contactEmail = RegistrationPayload.FirstString(payload, "email", "applicantEmail", "officialEmail");
            contactPhone = RegistrationPayload.FirstString(payload, "phone", "mobile", "applicantPhone", "officialPhone");
        }
        catch (JsonException)
        {
            // A malformed payload must not take the whole queue down.
        }

        return new
        {
            applicantName = name,
            contactEmail,
            contactPhone,
            r.Id,
            r.Type,
            r.ReferenceNumber,
            r.Status,
            statusLabelAr = RegistrationStatuses.Labels.TryGetValue(r.Status, out var l) ? l.Ar : r.Status,
            statusLabelEn = RegistrationStatuses.Labels.TryGetValue(r.Status, out var l2) ? l2.En : r.Status,
            r.StageOrder,
            stageCount = track?.Stages.Count ?? 0,
            r.MembershipNumber,
            r.CreatedAt,
            r.StatusChangedAt,
            r.ApprovedAt,
            r.ExpiresAt,
            r.RenewedAt,
            r.RenewalCount,
            r.CompletionDueAt,
            r.SupersedesId,
            r.LastActionBy,
            isExpired = r.IsExpired(now),
            isOverdue = r.Status == RegistrationStatuses.AwaitingCompletion
                        && r.CompletionDueAt is { } due && due <= now,
            // BUG-12 — zero once the term is over, never the negative number a
            // plain subtraction produced.
            daysUntilExpiry = r.DaysRemaining(now),
        };
    }

    /// <summary>Full record, including the payload, for the review screen.</summary>
    private static object Detail(Registration r) => new
    {
        summary = Summarise(r),
        r.Id,
        r.Type,
        r.ReferenceNumber,
        r.Status,
        r.StatusReason,
        r.InternalNotes,
        r.MembershipNumber,
        r.PayloadJson,
        r.CreatedAt,
        r.StatusChangedAt,
        r.ApprovedAt,
        r.ExpiresAt,
        r.RenewedAt,
        r.RenewalCount,
        r.CompletionDueAt,
        r.SuspendedAt,
        r.StageOrder,
        r.SupersedesId,
        r.LastActionBy,
        track = MembershipTracks.Get(r.Type) is { } t
            ? new { t.Key, t.LicenceNameAr, t.LicenceNameEn, t.TermYears, stages = t.Stages }
            : null,
    };

    private static void MapContactAdmin(RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/contact-messages").RequirePermission(AdminPermissions.Support);

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
        // Confidential by nature; no §17 role covers it, so by default only the
        // Super Admin holds it until a role is deliberately granted it.
        var group = admin.MapGroup("/whistleblower").RequirePermission(AdminPermissions.Whistleblower);

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
        var group = admin.MapGroup("/settings").RequirePermission(AdminPermissions.Settings);

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
