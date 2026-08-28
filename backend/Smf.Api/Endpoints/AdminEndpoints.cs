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

        // §1 — تجديد كل 3 سنوات.
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
        group.MapGet("/tracks", () => Results.Ok(
            MembershipTracks.All.Select(t => new
            {
                key = t.Key,
                licenceNameAr = t.LicenceNameAr,
                licenceNameEn = t.LicenceNameEn,
                termYears = t.TermYears,
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
                role = actor.Role,
                membershipRole = actor.MembershipRole,
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
    private static IResult Forbid(string action) => Results.Json(new
    {
        message = "لا تملك صلاحية تنفيذ هذا الإجراء. / You do not have permission for this action.",
        messageAr = "لا تملك صلاحية تنفيذ هذا الإجراء على طلبات العضوية.",
        messageEn = $"Your role does not grant '{action}' on membership requests.",
        requiredAction = action,
    }, statusCode: StatusCodes.Status403Forbidden);

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
            daysUntilExpiry = r.ExpiresAt is { } exp ? (int?)(exp - now).TotalDays : null,
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
