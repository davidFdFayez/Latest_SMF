using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// Running a tournament — Phase 3 REQ-01 through REQ-11.
///
/// Grouped by the stage of the journey rather than by entity, because that is
/// how the document reads and how the work actually happens: setup, entries,
/// readiness, draw, schedule.
///
/// Each stage checks its own permission. They are separate grants because the
/// document hands each stage to a different person, and the weigh-in desk has
/// no business redrawing a bracket.
/// </summary>
public static class TournamentEndpoints
{
    public static void MapTournamentAdmin(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/tournaments").WithTags("Tournaments");

        MapSetup(group);
        MapEntries(group);
        MapReadiness(group);
        MapDraw(group);
        MapSchedule(group);
        // Stage 5 — REQ-11 Bout Schedule (ring-grouped daily numbering, per-ring/day timing, lifecycle).
        BoutScheduleEndpoints.MapBoutSchedule(group);
    }

    /* ── REQ-01 / REQ-02: setting a tournament up ───────────────────────── */

    private static void MapSetup(RouteGroupBuilder group)
    {
        group.MapGet("/options", async (TournamentLookups lookups, CancellationToken ct) => Results.Ok(new
        {
            // REQ-01 rules 2 and 3 — read from the lists, which the federation
            // can add to, rather than from a fixed enum.
            types = (await lookups.ListAsync(LookupKinds.TournamentType, cancellationToken: ct))
                .Select(t => new { value = t.Value, ar = t.NameAr, en = t.NameEn, t.IsSeeded }),
            competitionTypes = (await lookups.ListAsync(LookupKinds.CompetitionType, cancellationToken: ct))
                .Select(t => new { value = t.Value, ar = t.NameAr, en = t.NameEn, t.IsSeeded }),
            categories = CompetitionCategories.All.Select(c => new
            {
                value = c.Value, ar = c.Ar, en = c.En, c.MinAge, c.MaxAge, c.Track,
            }),
            tracks = new[] { "development", "elite", "masters" }.Select(t => new
            {
                value = t,
                ar = CompetitionCategories.Tracks.Label(t).Ar,
                en = CompetitionCategories.Tracks.Label(t).En,
            }),
            statuses = TournamentStatuses.All.Select(s => new
            {
                value = s,
                ar = TournamentStatuses.Labels[s].Ar,
                en = TournamentStatuses.Labels[s].En,
            }),
            defaultRegistrationCloseDays = Tournament.DefaultRegistrationCloseDays,
            // Where a published tournament can be shown on the website.
            activityCategories = ActivityCategories.All.Select(c => new { value = c.Value, ar = c.Ar, en = c.En }),
        })).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentEntries,
            AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDraw,
            AdminPermissions.TournamentSchedule);

        /// REQ-01 rules 2 and 3 — an authorised user adds a new tournament
        /// type or competition type. The system's existing rules then apply to
        /// it unchanged (rule 7), which holds because nothing branches on it.
        group.MapPost("/options/{kind}", async (
            string kind, LookupRequest request, ClaimsPrincipal user,
            TournamentLookups lookups, CancellationToken ct) =>
        {
            var (result, entry) = await lookups.AddAsync(
                kind, request.NameAr ?? string.Empty, request.NameEn ?? string.Empty,
                AdminIdentity.Current(user), ct);

            return result.Ok
                ? Results.Ok(new { entry!.Id, entry.Value, entry.NameAr, entry.NameEn })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage);

        group.MapPost("/options/{id:int}/active", async (
            int id, ActiveRequest request, ClaimsPrincipal user,
            TournamentLookups lookups, CancellationToken ct) =>
        {
            var result = await lookups.SetActiveAsync(id, request.IsActive, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { id, request.IsActive }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage);

        /// The weight classes offered for a category and gender (REQ-01 rule 6).
        group.MapGet("/weight-classes", (string category, string gender) => Results.Ok(
                WeightClasses.For(category, gender).Select(w => new
                {
                    limitKg = w.LimitKg,
                    floorKg = w.FloorKg,
                    labelAr = w.Label(arabic: true),
                    labelEn = w.Label(arabic: false),
                })))
            .RequirePermission(AdminPermissions.TournamentManage);

        group.MapGet("/", async (string? status, SmfDbContext db, CancellationToken ct) =>
        {
            var query = db.Tournaments.AsNoTracking();
            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(t => t.Status == status);

            var tournaments = await query.OrderByDescending(t => t.StartDate).ToListAsync(ct);
            var counts = await db.TournamentEntries
                .GroupBy(e => e.TournamentId)
                .Select(g => new { TournamentId = g.Key, Count = g.Count() })
                .ToListAsync(ct);

            return Results.Ok(tournaments.Select(t => Summarise(t,
                counts.FirstOrDefault(c => c.TournamentId == t.Id)?.Count ?? 0)));
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentEntries,
            AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDraw,
            AdminPermissions.TournamentSchedule, AdminPermissions.TournamentDirector);

        group.MapGet("/{id:int}", async (int id, SmfDbContext db, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking()
                .FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var divisions = await db.TournamentDivisions.AsNoTracking()
                .Where(d => d.TournamentId == id)
                .ToListAsync(ct);

            var entryCounts = await db.TournamentEntries
                .Where(e => e.TournamentId == id && e.DivisionId != null)
                .GroupBy(e => e.DivisionId!.Value)
                .Select(g => new { DivisionId = g.Key, Count = g.Count() })
                .ToListAsync(ct);

            var rings = await db.TournamentRings.AsNoTracking()
                .Where(r => r.TournamentId == id).OrderBy(r => r.SortOrder).ToListAsync(ct);

            return Results.Ok(new
            {
                tournament = Summarise(tournament, entryCounts.Sum(c => c.Count)),
                categories = TournamentService.Split(tournament.Categories),
                genders = TournamentService.Split(tournament.Genders),
                weightClasses = ReadSelection(tournament.WeightClassesJson),
                tournament.ExactWeightClasses,
                divisions = divisions
                    .OrderBy(d => d.Category, StringComparer.Ordinal)
                    .ThenBy(d => d.Gender).ThenBy(d => d.SortWeight)
                    .Select(d => new
                    {
                        d.Id, d.Category, d.Gender, d.WeightLimitKg, d.WeightFloorKg,
                        labelAr = d.Describe(arabic: true),
                        labelEn = d.Describe(arabic: false),
                        d.DrawPublishedAt, d.DefaultRingId, d.ScheduledDate,
                        d.FirstBoutTime, d.BoutIntervalMinutes,
                        entries = entryCounts.FirstOrDefault(c => c.DivisionId == d.Id)?.Count ?? 0,
                    }),
                rings = rings.Select(r => new { r.Id, r.Name, r.SortOrder, r.FirstBoutTime, r.BoutIntervalMinutes }),
            });
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentEntries,
            AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDraw,
            AdminPermissions.TournamentSchedule);

        group.MapPost("/", async (
            TournamentSetupRequest request,
            ClaimsPrincipal user,
            TournamentService service,
            CancellationToken ct) =>
        {
            var (result, tournament) = await service.CreateAsync(
                request.ToSetup(), AdminIdentity.Current(user), ct);

            return result.Ok
                ? Results.Created($"/api/admin/tournaments/{tournament!.Id}", Summarise(tournament, 0))
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage);

        group.MapPut("/{id:int}", async (
            int id,
            TournamentSetupRequest request,
            ClaimsPrincipal user,
            SmfDbContext db,
            TournamentService service,
            CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);
            var needed = EditPermissionFor(tournament);
            if (!actor.Has(needed)) return PermissionFilter.Forbidden(needed);

            var result = await service.UpdateAsync(tournament, request.ToSetup(), actor, ct);
            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentApprove);

        /* The public page's banner. The same permission as editing the
           tournament (manage while a draft, approve once published), the
           site's own media store, and only the photo formats a banner uses. */
        group.MapPost("/{id:int}/banner", async (
            int id, IFormFile? file, [FromForm] string? crop, ClaimsPrincipal user, SmfDbContext db,
            MediaStore store, AuditLogger audit, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);
            var needed = EditPermissionFor(tournament);
            if (!actor.Has(needed)) return PermissionFilter.Forbidden(needed);

            if (file is null) return BannerRefused("لم يتم إرفاق صورة.", "No image was attached.");
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (extension is not (".jpg" or ".jpeg" or ".png" or ".webp"))
                return BannerRefused("صيغة الصورة غير مدعومة. المسموح: JPG وPNG وWebP.", "Unsupported image type. Allowed: JPG, PNG, WebP.");
            if (file.Length > BannerMaxBytes)
                return BannerRefused("حجم الصورة يتجاوز 5 ميجابايت.", "The image is larger than 5 MB.");

            // A new image starts from the default framing, unless the upload
            // carries the position chosen for it (a tournament being created
            // sends the one picked before it existed). "X Y Zoom".
            BannerCrop? position = null;
            if (!string.IsNullOrWhiteSpace(crop))
            {
                position = BannerCrop.Parse(crop);
                if (position is null) return BannerRefused("موضع صورة البانر غير صالح.", "The banner position is not valid.");
            }

            // The store checks the bytes match the type, and names the file.
            var saved = await store.SaveAsync(file, ct);
            if (saved.Media is null) return BannerRefused(saved.ErrorAr ?? "", saved.ErrorEn ?? "");

            var previous = tournament.BannerImageUrl;
            tournament.BannerImageUrl = saved.Media.Url;
            tournament.BannerImageCrop = position?.Write();
            tournament.UpdatedAt = DateTime.UtcNow;
            audit.Write(actor, AuditActions.TournamentUpdated, "tournament", tournament.Id,
                fromStatus: previous, toStatus: saved.Media.Url,
                details: (previous is null ? "Banner image added: " : "Banner image replaced: ") + saved.Media.FileName
                    + (position is null ? "" : " (position " + position.Write() + ")"));
            await db.SaveChangesAsync(ct);

            return Results.Ok(BannerSummary(tournament));
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentApprove).DisableAntiforgery();

        group.MapDelete("/{id:int}/banner", async (
            int id, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);
            var needed = EditPermissionFor(tournament);
            if (!actor.Has(needed)) return PermissionFilter.Forbidden(needed);

            if (tournament.BannerImageUrl is not null)
            {
                // The stored file stays: media URLs are permanent and may be cached.
                audit.Write(actor, AuditActions.TournamentUpdated, "tournament", tournament.Id,
                    fromStatus: tournament.BannerImageUrl, details: "Banner image removed.");
                tournament.BannerImageUrl = null;
                tournament.BannerImageCrop = null;
                tournament.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }

            return Results.Ok(BannerSummary(tournament));
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentApprove);

        group.MapPost("/{id:int}/publish", async (
            int id, ClaimsPrincipal user, SmfDbContext db, TournamentService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var result = await service.PublishAsync(tournament, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentApprove);

        group.MapPost("/{id:int}/status", async (
            int id, StatusRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            // Setting a status of "published" is publishing, and moving a
            // published tournament anywhere — back to draft included — is
            // controlling it after publication. Both are the approval grant.
            var actor = AdminIdentity.Current(user);
            var needed = request.Status == TournamentStatuses.Published
                ? AdminPermissions.TournamentApprove
                : EditPermissionFor(tournament);
            if (!actor.Has(needed)) return PermissionFilter.Forbidden(needed);

            var result = await service.ChangeStatusAsync(tournament, request.Status, actor, ct);
            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentApprove);

        group.MapPost("/{id:int}/registration-closes", async (
            int id, RegistrationCloseRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);
            var needed = EditPermissionFor(tournament);
            if (!actor.Has(needed)) return PermissionFilter.Forbidden(needed);

            var result = await service.ExtendRegistrationAsync(tournament, request.ClosesAt, actor, ct);

            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage, AdminPermissions.TournamentApprove);
    }

    /* ── REQ-03: entries ────────────────────────────────────────────────── */

    private static void MapEntries(RouteGroupBuilder group)
    {
        /// What this athlete may enter, and why not where they may not.
        group.MapGet("/{id:int}/eligibility/{athleteId:int}", async (
            int id, int athleteId, SmfDbContext db, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var athlete = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            var divisions = await db.TournamentDivisions.AsNoTracking()
                .Where(d => d.TournamentId == id).ToListAsync(ct);

            var suspensions = await db.MedicalSuspensions.AsNoTracking()
                .Where(s => s.AthleteRegistrationId == athleteId).ToListAsync(ct);

            var already = await db.TournamentEntries
                .AnyAsync(e => e.TournamentId == id && e.AthleteRegistrationId == athleteId, ct);

            var verdict = TournamentEligibility.Assess(
                tournament, athlete, divisions, suspensions, already, DateTime.UtcNow);

            return Results.Ok(new
            {
                verdict.CanEnter,
                verdict.MustChooseTrack,
                verdict.AlreadyEntered,
                barriers = verdict.Barriers.Select(b => new { b.Code, b.Ar, b.En }),
                verdict.Tracks,
                options = verdict.Options,
            });
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentManage);

        group.MapGet("/{id:int}/entries", async (
            int id, string? status, int? divisionId, SmfDbContext db, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var query = db.TournamentEntries.AsNoTracking()
                .Include(e => e.AthleteRegistration)
                .Include(e => e.Division)
                .Where(e => e.TournamentId == id);

            if (!string.IsNullOrWhiteSpace(status)) query = query.Where(e => e.Status == status);
            if (divisionId is { } d) query = query.Where(e => e.DivisionId == d);

            var entries = await query.ToListAsync(ct);
            var medical = await db.AthleteMedicalFiles.AsNoTracking()
                .Where(f => entries.Select(e => e.AthleteRegistrationId).Contains(f.AthleteRegistrationId))
                .ToListAsync(ct);

            return Results.Ok(entries
                .OrderBy(e => e.Division?.Category, StringComparer.Ordinal)
                .ThenBy(e => e.Division?.SortWeight)
                .Select(e => DescribeEntry(e, medical.FirstOrDefault(f => f.AthleteRegistrationId == e.AthleteRegistrationId),
                    TournamentEligibility.TournamentYear(tournament))));
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical,
            AdminPermissions.TournamentManage, AdminPermissions.TournamentDraw);

        group.MapPost("/{id:int}/entries", async (
            int id, EntryRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);
            var (result, entry) = await service.EnterAsync(
                tournament,
                new TournamentEntryService.EntryRequest(
                    request.AthleteRegistrationId, request.DivisionId, request.Track, request.Category,
                    request.DeclaredWeightKg, request.HeightCm, request.ClubName,
                    request.TrainingCentre, request.CoachName, request.CoachPhone),
                EntrySources.Admin, actor.Username, actor, ct);

            return result.Ok ? Results.Ok(new { entry!.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentEntries);

        group.MapPut("/entries/{entryId:int}", async (
            int entryId, EntryAmendRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.AmendAsync(
                entry, request.DivisionId, request.DeclaredWeightKg, AdminIdentity.Current(user), ct, request.Reason);

            return result.Ok ? Results.Ok(new { entry.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/withdraw", async (
            int entryId, ReasonRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService entries, DrawService draws, CancellationToken ct) =>
        {
            var actor = AdminIdentity.Current(user);

            // The status change and what it means for the bracket commit together
            // or not at all, under the write lock (DRW-003 remediation).
            await using var transaction = await EmailReservations.BeginExclusiveAsync(db, ct);
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            // D2/D5 — withdrawing an athlete who is in a draw changes that draw: a reason is compulsory.
            var reason = string.IsNullOrWhiteSpace(request.Reason) ? null : request.Reason.Trim();
            var drawn = entry.DivisionId is { } drawnDivision && await db.Bouts.AnyAsync(
                b => b.DivisionId == drawnDivision && (b.RedEntryId == entry.Id || b.BlueEntryId == entry.Id), ct);
            if (drawn && reason is null)
            {
                return Problem(TournamentService.Outcome.Invalid(
                    "سحب لاعب من قرعة يتطلب ذكر السبب.",
                    "Withdrawing an athlete who is in a draw requires a reason."));
            }

            var result = await entries.WithdrawAsync(entry, reason, actor, ct);
            if (!result.Ok) return Problem(result);

            // REQ-10 rules 7 and 8 — what that means for the bracket.
            var change = await draws.ApplyWithdrawalAsync(entry, reason, actor, ct);
            if (!change.Result.Ok) return DrawProblem(change);

            await transaction.CommitAsync(ct);
            return Results.Ok(new { entry.Id, entry.Status });
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical);
    }

    /* ── REQ-08 / REQ-09: readiness ─────────────────────────────────────── */

    private static void MapReadiness(RouteGroupBuilder group)
    {
        // The body is optional: a plain check-in sends none; correcting a No
        // Show recorded at check-in sends { reason }.
        group.MapPost("/entries/{entryId:int}/check-in", async (
            int entryId, HttpRequest http, ClaimsPrincipal user, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            string? reason = null;
            if (http.HasJsonContentType())
            {
                try
                {
                    reason = (await http.ReadFromJsonAsync<ReasonRequest>(ct))?.Reason;
                }
                catch (JsonException)
                {
                    return Results.BadRequest(new { message = "The request body is not valid JSON." });
                }
            }

            var result = await service.CheckInAsync(entry, AdminIdentity.Current(user), ct, reason);
            return result.Ok ? Results.Ok(new { entry.Id, entry.Status, entry.CheckedInAt }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/medical", async (
            int entryId, MedicalResultRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.RecordMedicalAsync(
                entry, request.Result, request.Note, request.DocumentsMissing, AdminIdentity.Current(user), ct,
                request.CorrectionReason, request.MissingDocumentsReason);

            return result.Ok ? Results.Ok(new { entry.Id, entry.Status, entry.MedicalResult }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapGet("/entries/{entryId:int}/weigh-in/preview", async (
            int entryId, decimal weightKg, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            // The same precision rule as recording: at most two decimal places, never rounded.
            if (TournamentEntryService.PreviewWeightInvalid(weightKg) is { } invalid) return Problem(invalid);

            var view = await service.PreviewWeighInAsync(entry, weightKg, ct);
            return Results.Ok(new
            {
                view!.ActualWeightKg,
                view.WithinRegisteredClass,
                // matches | below_minimum | exceeds_class | not_configured, and the range it was judged on.
                verdict = view.Verdict.Code(),
                range = view.Range.Describe(),
                view.RegisteredClassLabel,
                view.ActualClassLabel,
                alternatives = view.Alternatives.Select(d => new
                {
                    d.Id, labelEn = d.Describe(false), labelAr = d.Describe(true),
                }),
                // Every class the athlete may be moved to, with whether this weight fits it.
                classes = view.Classes.Select(c => new
                {
                    c.Division.Id, c.Division.WeightLimitKg, c.Division.WeightFloorKg,
                    label = c.Division.WeightLabel(false), c.Fits,
                    current = c.Division.Id == entry.DivisionId,
                }),
            });
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/weigh-in", async (
            int entryId, WeighInRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);

            var result = request.NoShow
                ? await service.MarkNoShowAsync(entry, actor, ct)
                : await service.RecordWeighInAsync(
                    entry, request.WeightKg ?? 0, request.Result ?? ReadinessResults.Failed,
                    request.MoveToDivisionId, actor, ct, request.Reason);

            return result.Ok
                ? Results.Ok(new { entry.Id, entry.Status, entry.WeighInResult, entry.ActualWeightKg, entry.DivisionId })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        // REQ-09 rule 4 — move to another class at the weigh-in, keeping the
        // measured weight; the result is then given against the new class.
        group.MapPost("/entries/{entryId:int}/weigh-in/move", async (
            int entryId, WeighInMoveRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.MoveAtWeighInAsync(
                entry, request.WeightKg, request.DivisionId, request.Reason, AdminIdentity.Current(user), ct);

            return result.Ok
                ? Results.Ok(new { entry.Id, entry.Status, entry.WeighInResult, entry.ActualWeightKg, entry.DivisionId })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/approve", async (
            int entryId, HttpRequest http, ClaimsPrincipal user, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            // The body is optional: a first approval sends none; changing a
            // Rejected decision sends { reason }.
            string? reason = null;
            if (http.HasJsonContentType())
            {
                try
                {
                    reason = (await http.ReadFromJsonAsync<ReasonRequest>(ct))?.Reason;
                }
                catch (JsonException)
                {
                    return Results.BadRequest(new { message = "The request body is not valid JSON." });
                }
            }

            var result = await service.ApproveReadinessAsync(entry, AdminIdentity.Current(user), ct, reason);
            return result.Ok ? Results.Ok(new { entry.Id, entry.Status, entry.QualifiedAt }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentDirector);

        group.MapPost("/entries/{entryId:int}/reject", async (
            int entryId, ReasonRequest request, ClaimsPrincipal user, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var (result, inDraw) = await service.RejectReadinessAsync(entry, request.Reason, AdminIdentity.Current(user), ct);
            return result.Ok
                ? Results.Ok(new
                {
                    entry.Id, entry.Status, entry.ReadinessRejectedAt, entry.ReadinessRejectionReason,
                    inUnpublishedDraw = inDraw,
                })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentDirector);
    }

    /* ── REQ-10: the draw ───────────────────────────────────────────────── */

    private static void MapDraw(RouteGroupBuilder group)
    {
        // Draw Management overview: every division of a tournament with how
        // many athletes are eligible (DrawEligibility: Final Draw Approval on a
        // weigh-in that holds for the class — the rule the draw itself takes
        // its pool from), whether a draw has been generated
        // (it has bouts) and whether it is published. Read-only: opening the
        // page records nothing.
        group.MapGet("/{id:int}/draw-overview", async (int id, SmfDbContext db, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var divisions = await db.TournamentDivisions.AsNoTracking()
                .Where(d => d.TournamentId == id)
                .ToListAsync(ct);

            // Eligibility is computed, so the entries come into memory first — read fresh on
            // every request (no cache): the counts are always the current authoritative data.
            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.AthleteRegistration)
                .Where(e => e.TournamentId == id && e.DivisionId != null)
                .ToListAsync(ct);
            var byId = divisions.ToDictionary(d => d.Id);
            // The draw pool's own rule (generation, regeneration and DrawService.SyncAsync):
            // Final Draw Approval on a weigh-in valid for the current class.
            bool Eligible(TournamentEntry e) =>
                e.Status == EntryStatuses.Qualified
                && byId.TryGetValue(e.DivisionId!.Value, out var d) && DrawEligibility.Eligible(e, d);
            var approved = entries
                .Where(Eligible)
                .GroupBy(e => e.DivisionId!.Value)
                .ToDictionary(g => g.Key, g => g.Count());

            var bouts = await db.Bouts.AsNoTracking()
                .Where(b => b.TournamentId == id)
                .GroupBy(b => b.DivisionId)
                .Select(g => new { DivisionId = g.Key, Count = g.Count() })
                .ToDictionaryAsync(g => g.DivisionId, g => g.Count, ct);

            // The saved draws' own athletes and BYEs, to compare by entry identity
            // with who is eligible now (DrawService.SyncAsync does the same per division).
            var firstRound = (await db.Bouts.AsNoTracking()
                    .Where(b => b.TournamentId == id && b.Round == 1)
                    .ToListAsync(ct))
                .GroupBy(b => b.DivisionId)
                .ToDictionary(g => g.Key, g => (Ids: DrawService.DrawEntryIdsOf(g),
                    Byes: g.Count(b => b.IsBye && !b.IsWalkover)));
            var eligibleIds = entries
                .Where(Eligible)
                .GroupBy(e => e.DivisionId!.Value)
                .ToDictionary(g => g.Key, g => g.Select(e => e.Id).ToHashSet());
            // Participants as the Participants page counts them (every entry not withdrawn), and
            // those of them not draw-eligible, each with every missing requirement — so
            // participants = eligible + not yet eligible, in every division, with or without a draw.
            var assigned = entries
                .Where(e => e.Status != EntryStatuses.Withdrawn)
                .GroupBy(e => e.DivisionId!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());
            List<object> NotEligible(TournamentDivision d) =>
                (assigned.GetValueOrDefault(d.Id) ?? [])
                .Where(e => !(eligibleIds.GetValueOrDefault(d.Id)?.Contains(e.Id) ?? false))
                .OrderBy(e => e.Id)
                .Select(e => (object)new
                {
                    entryId = e.Id,
                    nameEn = DrawService.DisplayName(e, arabic: false),
                    nameAr = DrawService.DisplayName(e, arabic: true),
                    reference = e.AthleteRegistration?.MembershipNumber ?? e.AthleteRegistration?.ReferenceNumber,
                    reason = DrawService.MissingConditions(e, d),
                    // Still placed in the saved draw (it then has to be regenerated).
                    inDraw = firstRound.TryGetValue(d.Id, out var f) && f.Ids.Contains(e.Id),
                })
                .ToList();

            var categoryOrder = CompetitionCategories.All.Select(c => c.Value).ToList();
            // Published draws being updated: the published version is still on the website, the update is a Draft.
            var keptPublished = (await db.DrawPublications.AsNoTracking()
                    .Where(p => p.TournamentId == tournament.Id && p.SupersededAt == null).Select(p => p.DivisionId).ToListAsync(ct))
                .ToHashSet();
            return Results.Ok(new
            {
                tournament = new { tournament.Id, tournament.NameAr, tournament.NameEn, tournament.Status },
                // Female first, then Male; categories youngest to oldest in the
                // official order; weight classes lightest to heaviest.
                divisions = divisions
                    .OrderBy(d => d.Gender == "female" ? 0 : 1)
                    .ThenBy(d => categoryOrder.IndexOf(d.Category) is var i and >= 0 ? i : int.MaxValue)
                    .ThenBy(d => d.SortWeight)
                    .Select(d => new
                    {
                        d.Id,
                        d.Gender,
                        d.Category,
                        categoryEn = CompetitionCategories.Label(d.Category).En,
                        weightEn = d.WeightLabel(arabic: false),
                        approvedAthletes = approved.GetValueOrDefault(d.Id),
                        // The same arithmetic the division page shows (DrawMath).
                        byes = DrawMath.For(approved.GetValueOrDefault(d.Id)).Byes,
                        overCapacity = DrawMath.For(approved.GetValueOrDefault(d.Id)).Kind == DrawMath.Kind.OverCapacity,
                        drawGenerated = bouts.GetValueOrDefault(d.Id) > 0,
                        d.DrawPublishedAt,
                        updatePending = d.DrawPublishedAt == null && keptPublished.Contains(d.Id),
                        // `byes` above is potential (current eligibility); these are the saved draw's.
                        drawAthletes = firstRound.TryGetValue(d.Id, out var fr) ? fr.Ids.Count : (int?)null,
                        drawByes = firstRound.TryGetValue(d.Id, out var fr2) ? fr2.Byes : (int?)null,
                        eligibleChanged = firstRound.TryGetValue(d.Id, out var fr3)
                                          && !fr3.Ids.SetEquals(eligibleIds.GetValueOrDefault(d.Id) ?? []),
                        participants = assigned.GetValueOrDefault(d.Id)?.Count ?? 0,
                        eligible = approved.GetValueOrDefault(d.Id),
                        notEligible = NotEligible(d),
                    }),
            });
        }).RequirePermission(AdminPermissions.TournamentDraw, AdminPermissions.TournamentSchedule,
            AdminPermissions.TournamentManage);

        // Draw Management — Phase 2: one division, ready for its draw. The
        // eligible athletes (DrawEligibility — the rule the draw takes its
        // pool from, so the count and the list cannot differ),
        // in a stable order, with the bracket arithmetic for that count.
        // Read-only: nothing is generated, assigned or recorded.
        group.MapGet("/divisions/{divisionId:int}/draw-preparation", async (int divisionId, SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == division.TournamentId, ct);
            if (tournament is null) return Results.NotFound();

            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.AthleteRegistration)
                .Where(e => e.TournamentId == tournament.Id && e.DivisionId == division.Id)
                .ToListAsync(ct);

            var athletes = entries
                .Where(e => DrawEligibility.Eligible(e, division))
                .Select(e =>
                {
                    string? nameAr = null, nameEn = null;
                    if (e.AthleteRegistration is { } registration)
                    {
                        try
                        {
                            var payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
                            nameAr = RegistrationPayload.DisplayName(payload, true);
                            nameEn = RegistrationPayload.DisplayName(payload, false);
                        }
                        catch (JsonException)
                        {
                            // A malformed form must not take the page down.
                        }
                    }
                    return new
                    {
                        entryId = e.Id,
                        nameEn = nameEn ?? nameAr,
                        nameAr = nameAr ?? nameEn,
                        club = TournamentParticipantsEndpoints.ClubOf(e),
                        reference = e.AthleteRegistration?.MembershipNumber ?? e.AthleteRegistration?.ReferenceNumber,
                        approvedAt = e.QualifiedAt,
                        approvedBy = e.QualifiedBy,
                    };
                })
                // Stable before any draw exists: by name, then by entry.
                .OrderBy(a => a.nameEn ?? a.nameAr ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .ThenBy(a => a.entryId)
                .ToList();

            var plan = DrawMath.For(athletes.Count);
            var bouts = await db.Bouts.AsNoTracking().CountAsync(b => b.DivisionId == division.Id, ct);

            return Results.Ok(new
            {
                tournament = new { tournament.Id, tournament.NameAr, tournament.NameEn },
                division = new
                {
                    division.Id,
                    division.Gender,
                    division.Category,
                    categoryEn = CompetitionCategories.Label(division.Category).En,
                    weightEn = division.WeightLabel(arabic: false),
                    drawGenerated = bouts > 0,
                    division.DrawPublishedAt,
                },
                athletes,
                // The saved draw against these athletes, by entry identity.
                sync = (await service.SyncAsync(division, ct)).Describe(),
                plan = new
                {
                    athletes = plan.Athletes,
                    kind = plan.Kind switch
                    {
                        DrawMath.Kind.NoEligibleAthletes => "none",
                        DrawMath.Kind.NoContest => "no_contest",
                        DrawMath.Kind.OverCapacity => "over_capacity",
                        _ => "bracket",
                    },
                    plan.BracketSize,
                    plan.Byes,
                    plan.PreliminaryBouts,
                    plan.NextRoundAthletes,
                    plan.TotalBouts,
                    plan.CanDraw,
                    maxAthletes = DrawMath.MaxAthletes,
                    format = "Single Elimination",
                },
            });
        }).RequirePermission(AdminPermissions.TournamentDraw, AdminPermissions.TournamentSchedule,
            AdminPermissions.TournamentManage);

        group.MapGet("/divisions/{divisionId:int}/draw", async (
            int divisionId, SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            return Results.Ok(await service.BracketAsync(division, ct));
        }).RequirePermission(AdminPermissions.TournamentDraw, AdminPermissions.TournamentSchedule,
            AdminPermissions.TournamentManage);

        group.MapPost("/divisions/{divisionId:int}/draw", async (
            int divisionId, DrawRequest request, ClaimsPrincipal user,
            SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            var change = await service.CreateAsync(
                division, AdminIdentity.Current(user), request.Seed, request.Reason, ct);

            // status: the publication state after the redraw (a published draw stays published);
            // schedule: "kept" when scheduled bouts kept their slots, otherwise "none".
            return change.Result.Ok
                ? Results.Ok(new { bouts = change.Bouts, status = change.Status, schedule = change.Schedule })
                : DrawProblem(change);
        }).RequirePermission(AdminPermissions.TournamentDraw);

        // Draw Management — Phase 3: generate a division's draw as a Draft.
        // Never replaces an existing draw; refuses a stale athlete list; one
        // at a time under the write lock (DrawService.GenerateDraftAsync).
        // dryRun runs every check without writing, so the preparation page can
        // validate before it shows the generation screen.
        group.MapPost("/divisions/{divisionId:int}/draw/generate", async (
            int divisionId, GenerateDrawRequest request, ClaimsPrincipal user,
            SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            var (result, refusal, draw, _) = await service.GenerateDraftAsync(
                division, request.ExpectedEntryIds ?? [], request.DryRun, AdminIdentity.Current(user), ct);

            if (!result.Ok)
            {
                return Results.Json(new
                {
                    message = $"{result.MessageAr} / {result.MessageEn}",
                    messageAr = result.MessageAr,
                    messageEn = result.MessageEn,
                    code = refusal,
                }, statusCode: result.Status);
            }
            if (draw is null) return Results.Ok(new { valid = true });
            return Results.Ok(new
            {
                divisionId = division.Id,
                status = "draft",
                athletes = request.ExpectedEntryIds?.Count ?? 0,
                byes = draw.ByeCount,
                bouts = draw.Bouts.Count(b => !b.IsBye),
                rounds = draw.TotalRounds,
            });
        }).RequirePermission(AdminPermissions.TournamentDraw);

        // Draw Management: replace a Draft whose eligible athletes have changed,
        // on an explicit, confirmed request with a reason (DrawService.RegenerateDraftAsync).
        group.MapPost("/divisions/{divisionId:int}/draw/regenerate", async (
            int divisionId, RegenerateDrawRequest request, ClaimsPrincipal user,
            SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            var (result, refusal, draw) = await service.RegenerateDraftAsync(
                division, request.ExpectedEntryIds ?? [], request.ExpectedDrawEntryIds ?? [], request.Reason,
                request.Confirmed, AdminIdentity.Current(user), request.DryRun, ct, request.RevisePublished);

            if (!result.Ok)
            {
                return Results.Json(new
                {
                    message = $"{result.MessageAr} / {result.MessageEn}",
                    messageAr = result.MessageAr,
                    messageEn = result.MessageEn,
                    code = refusal,
                }, statusCode: result.Status);
            }
            if (draw is null) return Results.Ok(new { valid = true });
            return Results.Ok(new
            {
                divisionId = division.Id,
                status = "draft",
                athletes = request.ExpectedEntryIds?.Count ?? 0,
                byes = draw.ByeCount,
                bouts = draw.Bouts.Count(b => !b.IsBye),
                rounds = draw.TotalRounds,
            });
        }).RequirePermission(AdminPermissions.TournamentDraw);

        // Draw Management — Phase 3: the division's bracket, read-only, with
        // the figures taken from the stored bouts themselves.
        group.MapGet("/divisions/{divisionId:int}/draw-bracket", async (
            int divisionId, SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.AsNoTracking().FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == division.TournamentId, ct);
            if (tournament is null) return Results.NotFound();

            var bouts = await db.Bouts.AsNoTracking().Where(b => b.DivisionId == division.Id).ToListAsync(ct);
            if (bouts.Count == 0) return Results.NotFound(new { messageEn = "This division has no draw yet.", messageAr = "لا توجد قرعة لهذه الفئة بعد." });

            // Every athlete is placed once in round one, as a bout corner or a bye.
            var placed = bouts.Where(b => b.Round == 1)
                .SelectMany(b => new[] { b.RedEntryId, b.BlueEntryId })
                .Where(id => id is not null).Distinct().Count();
            var drawByes = bouts.Count(b => b.Round == 1 && b.IsBye && !b.IsWalkover);
            var created = await db.AuditLog.AsNoTracking()
                .Where(a => a.EntityType == "tournament_division" && a.EntityId == division.Id
                    && (a.Action == AuditActions.DrawCreated || a.Action == AuditActions.DrawAmended))
                .OrderByDescending(a => a.Id)
                .Select(a => new { at = a.CreatedAt, by = a.ActorName, a.Details })
                .FirstOrDefaultAsync(ct);

            return Results.Ok(new
            {
                tournament = new { tournament.Id, tournament.NameAr, tournament.NameEn },
                division = new
                {
                    division.Id,
                    division.Gender,
                    division.Category,
                    categoryEn = CompetitionCategories.Label(division.Category).En,
                    weightEn = division.WeightLabel(arabic: false),
                },
                // Generated and not yet published is a Draft; approval comes later.
                status = division.DrawPublishedAt is null ? "draft" : "published",
                division.DrawPublishedAt,
                // Publishing is refused while the bout schedule is approved (SCH-001); the page says why up front.
                scheduleApproved = tournament.ScheduleApprovedAt is not null,
                stats = new
                {
                    athletes = placed,
                    byes = drawByes,
                    bouts = bouts.Count(b => !b.IsBye),
                    bracketSize = DrawMath.BracketSize(Math.Max(placed, 1)),
                    format = "Single Elimination",
                },
                generated = created,
                bracket = await service.BracketAsync(division, ct),
                // Who is eligible now against who is in this saved draw; the stats above stay the draw's own.
                sync = (await service.SyncAsync(division, ct)).Describe(),
                // The version the website shows while an updated Draft is reviewed (null when none is kept), and every
                // published version, kept for the record.
                livePublication = division.DrawPublishedAt is null
                    && await service.CurrentPublicationAsync(division.Id, ct) is { } live
                    ? new { live.Version, live.PublishedAt, live.PublishedBy, live.Athletes }
                    : null,
                publications = await db.DrawPublications.AsNoTracking()
                    .Where(p => p.DivisionId == division.Id).OrderByDescending(p => p.Version)
                    .Select(p => new { p.Version, p.PublishedAt, p.PublishedBy, p.Athletes, p.SupersededAt, p.Note })
                    .ToListAsync(ct),
                // Informational only: a published bout schedule does not block regenerating or publishing a draw (the
                // website keeps that schedule version until an updated one is published; Bout Schedule flags it).
                schedulePublished = await db.SchedulePublications.AnyAsync(p => p.TournamentId == tournament.Id && p.WithdrawnAt == null, ct),
            });
        }).RequirePermission(AdminPermissions.TournamentDraw, AdminPermissions.TournamentSchedule,
            AdminPermissions.TournamentManage);

        // An athlete's profile photo for the bracket, read-only, with the
        // bracket's own permissions. Only athletes placed in this division's
        // draw, resolved by their entry (never by name), and only the
        // registration's personal photo. Private cache: it is personal data.
        group.MapGet("/divisions/{divisionId:int}/draw-bracket/photos/{entryId:int}", async (
            int divisionId, int entryId, HttpContext http, SmfDbContext db,
            RegistrationAttachmentStore attachments, CancellationToken ct) =>
        {
            var inDraw = await db.Bouts.AsNoTracking().AnyAsync(
                b => b.DivisionId == divisionId && (b.RedEntryId == entryId || b.BlueEntryId == entryId
                                                   || b.WinnerEntryId == entryId), ct);
            if (!inDraw) return Results.NotFound();

            var payload = await db.TournamentEntries.AsNoTracking()
                .Where(e => e.Id == entryId)
                .Select(e => e.AthleteRegistration!.PayloadJson)
                .FirstOrDefaultAsync(ct);
            var photoId = DrawService.AthletePhotoId(attachments, payload);
            if (photoId is null || !attachments.TryResolve(photoId, out var path, out var meta)) return Results.NotFound();

            http.Response.Headers.CacheControl = "private, max-age=600";
            http.Response.Headers["X-Content-Type-Options"] = "nosniff";
            return Results.File(path, meta.ContentType);
        }).RequirePermission(AdminPermissions.TournamentDraw, AdminPermissions.TournamentSchedule,
            AdminPermissions.TournamentManage, AdminPermissions.TournamentScheduleApprove);

        // The one publication workflow: the legacy draw page (no body) and Draw Management's
        // confirmation dialog (the reviewed lists in the body) both come here.
        group.MapPost("/divisions/{divisionId:int}/draw/publish", async (
            int divisionId, HttpRequest http, ClaimsPrincipal user, SmfDbContext db,
            DrawService service, AdminNotificationService notifications, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            PublishDrawRequest? request = null;
            if (http.HasJsonContentType())
            {
                try
                {
                    request = await http.ReadFromJsonAsync<PublishDrawRequest>(ct);
                }
                catch (JsonException)
                {
                    return Results.BadRequest(new { message = "The request body is not valid JSON." });
                }
            }

            var (result, ineligible) = await service.PublishAsync(division, AdminIdentity.Current(user), ct,
                request?.ExpectedDrawEntryIds, request?.ExpectedEntryIds);
            if (result.Ok)
            {
                // Informational: tells schedule administrators when this change affects a published bout schedule.
                await notifications.DrawPublishedAsync(division.TournamentId, ct);
                return Results.Ok(new { division.Id, division.DrawPublishedAt });
            }

            // Not published: who stopped it, so the delegate can correct the draft.
            return Results.Json(new
            {
                code = result.Code,
                message = result.MessageEn,
                messageAr = result.MessageAr,
                messageEn = result.MessageEn,
                division = new { division.Id, label = division.Describe(arabic: false) },
                ineligible = ineligible.Select(i => new { i.EntryId, i.Name, i.MemberId, i.Reason }),
            }, statusCode: result.Status);
        }).RequirePermission(AdminPermissions.TournamentDrawApprove);

        group.MapPut("/bouts/{boutId:int}/corner", async (
            int boutId, CornerRequest request, ClaimsPrincipal user,
            SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var bout = await db.Bouts.FirstOrDefaultAsync(b => b.Id == boutId, ct);
            if (bout is null) return Results.NotFound();

            var change = await service.AmendCornerAsync(
                bout, request.Corner, request.EntryId, request.Reason ?? string.Empty,
                AdminIdentity.Current(user), ct);

            return change.Result.Ok ? Results.Ok(new { bout.Id }) : DrawProblem(change);
        }).RequirePermission(AdminPermissions.TournamentDraw);
    }

    /* ── REQ-11: the schedule ───────────────────────────────────────────── */

    private static void MapSchedule(RouteGroupBuilder group)
    {
        group.MapGet("/{id:int}/schedule", async (
            int id, ScheduleService service, CancellationToken ct) =>
            Results.Ok(await service.ViewAsync(id, ct)))
            .RequirePermission(AdminPermissions.TournamentSchedule, AdminPermissions.TournamentManage,
                AdminPermissions.TournamentDraw);

        // Read-only: what changed in the draws since the schedule was published, and which divisions it affects.
        group.MapGet("/{id:int}/schedule/changes", async (
            int id, SmfDbContext db, ScheduleService service, DrawService draws, CancellationToken ct) =>
            await db.Tournaments.AnyAsync(t => t.Id == id, ct)
                ? Results.Ok(await service.ChangesSincePublicationAsync(id, draws, ct))
                : Results.NotFound())
            .RequirePermission(AdminPermissions.TournamentSchedule, AdminPermissions.TournamentManage,
                AdminPermissions.TournamentDraw);

        group.MapPost("/{id:int}/rings", async (
            int id, RingRequest request, ClaimsPrincipal user,
            SmfDbContext db, ScheduleService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var (result, ring) = await service.AddRingAsync(
                tournament, request.Name, request.FirstBoutTime, request.IntervalMinutes,
                AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { ring!.Id, ring.Name }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        group.MapPut("/rings/{ringId:int}", async (
            int ringId, RingRequest request, ClaimsPrincipal user,
            SmfDbContext db, ScheduleService service, CancellationToken ct) =>
        {
            var ring = await db.TournamentRings.FirstOrDefaultAsync(r => r.Id == ringId, ct);
            if (ring is null) return Results.NotFound();

            var result = await service.UpdateRingAsync(
                ring, request.Name, request.FirstBoutTime, request.IntervalMinutes,
                AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { ring.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        group.MapDelete("/rings/{ringId:int}", async (
            int ringId, ClaimsPrincipal user, SmfDbContext db,
            ScheduleService service, CancellationToken ct) =>
        {
            var ring = await db.TournamentRings.FirstOrDefaultAsync(r => r.Id == ringId, ct);
            if (ring is null) return Results.NotFound();

            var result = await service.RemoveRingAsync(ring, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { removed = ringId }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        group.MapPut("/divisions/{divisionId:int}/schedule", async (
            int divisionId, DivisionScheduleRequest request, ClaimsPrincipal user,
            SmfDbContext db, ScheduleService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            var result = await service.SetDivisionScheduleAsync(
                division, request.RingId, request.Date, request.FirstBoutTime, request.IntervalMinutes,
                AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { division.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        group.MapPut("/bouts/{boutId:int}/slot", async (
            int boutId, BoutSlotRequest request, ClaimsPrincipal user,
            SmfDbContext db, ScheduleService service, CancellationToken ct) =>
        {
            var bout = await db.Bouts.FirstOrDefaultAsync(b => b.Id == boutId, ct);
            if (bout is null) return Results.NotFound();

            var result = await service.MoveBoutAsync(
                bout, request.RingId, request.Date, AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { bout.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        group.MapPost("/{id:int}/schedule/generate", async (
            int id, GenerateRequest request, ClaimsPrincipal user,
            ScheduleService service, CancellationToken ct) =>
        {
            var result = await service.GenerateAsync(
                id, AdminIdentity.Current(user), ct,
                request.BoutsPerAthletePerDay ?? BoutScheduler.DefaultBoutsPerAthletePerDay);

            return result.Ok ? Results.Ok(await service.ViewAsync(id, ct)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        /// REQ-11 rule 14 — the running order is signed off separately from
        /// being made, and the stage after this one has nothing to work from
        /// until it is.
        group.MapPost("/{id:int}/schedule/approve", async (
            int id, ClaimsPrincipal user, SmfDbContext db,
            ScheduleService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var result = await service.ApproveScheduleAsync(tournament, AdminIdentity.Current(user), ct);
            return result.Ok
                ? Results.Ok(new { tournament.Id, tournament.ScheduleApprovedAt })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentScheduleApprove);

        // D3 — withdrawing the approval, the one controlled way back from an
        // approved schedule: an approver, a reason, audited with the previous and
        // new status. Nothing in the schedule is deleted or renumbered; it only
        // makes the schedule unapproved again, so it must be re-approved after
        // any change (approval re-checks the whole schedule).
        group.MapPost("/{id:int}/schedule/withdraw-approval", async (
            int id, ReasonRequest request, ClaimsPrincipal user, SmfDbContext db,
            ScheduleService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var result = await service.WithdrawApprovalAsync(tournament, request.Reason, AdminIdentity.Current(user), ct);
            return result.Ok
                ? Results.Ok(new { tournament.Id, tournament.ScheduleApprovedAt })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentScheduleApprove);
    }

    /* ── shapes ─────────────────────────────────────────────────────────── */

    /// <summary>
    /// The grant that changing this tournament takes. A draft that has never
    /// been published is its organiser's to edit (<c>tournament.manage</c>);
    /// from publication on it is the approver's (<c>tournament.approve</c>),
    /// and holding the first alone is not enough.
    /// </summary>
    private static string EditPermissionFor(Tournament t) =>
        t.Status == TournamentStatuses.Draft && t.PublishedAt is null
            ? AdminPermissions.TournamentManage
            : AdminPermissions.TournamentApprove;

    /// <summary>A banner is a photo for a wide header: 5 MB is ample.</summary>
    private const long BannerMaxBytes = 5 * 1024 * 1024;

    private static IResult BannerRefused(string ar, string en) =>
        Results.Json(new { message = $"{ar} / {en}", messageAr = ar, messageEn = en }, statusCode: StatusCodes.Status400BadRequest);

    private static object BannerSummary(Tournament t) => new
    {
        t.Id,
        t.BannerImageUrl,
        BannerImageCrop = BannerCrop.Parse(t.BannerImageCrop),
    };

    private static object Summarise(Tournament t, int entries) => new
    {
        t.Id,
        t.NameAr,
        t.NameEn,
        t.DescriptionAr,
        t.DescriptionEn,
        t.TermsAr,
        t.TermsEn,
        t.BannerImageUrl,
        BannerImageCrop = BannerCrop.Parse(t.BannerImageCrop),
        t.Type,
        t.CompetitionType,
        t.LocationAr,
        t.LocationEn,
        t.ActivityCategory,
        t.StartDate,
        t.EndDate,
        t.FirstBoutTime,
        t.RegistrationClosesAt,
        t.OnSiteCheckInStartsAt,
        t.OnSiteCheckInEndsAt,
        t.Status,
        statusAr = TournamentStatuses.Labels[t.Status].Ar,
        statusEn = TournamentStatuses.Labels[t.Status].En,
        t.PublishedAt,
        registrationOpen = t.IsRegistrationOpen(DateTime.UtcNow),
        categories = TournamentService.Split(t.Categories),
        genders = TournamentService.Split(t.Genders),
        days = t.Days(),
        entries,
        t.CreatedAt,
        t.LastActionBy,
    };

    /// <param name="tournamentYear">
    /// The entry's tournament year. What the athlete still needs medically
    /// depends on their age, and for an entry that is their competition age
    /// for this tournament — the same age registration and their Medical File use.
    /// </param>
    private static object DescribeEntry(TournamentEntry e, AthleteMedicalFile? medical, int tournamentYear)
    {
        string? nameAr = null, nameEn = null;
        DateTime? dateOfBirth = null;
        string? gender = null;

        if (e.AthleteRegistration is { } athlete)
        {
            try
            {
                var payload = JsonDocument.Parse(athlete.PayloadJson).RootElement;
                nameAr = RegistrationPayload.DisplayName(payload, true);
                nameEn = RegistrationPayload.DisplayName(payload, false);
                dateOfBirth = TournamentEligibility.DateOfBirthOf(athlete);
                gender = TournamentEligibility.GenderOf(athlete);
            }
            catch (JsonException)
            {
                // A malformed payload must not take the desk list down.
            }
        }

        var age = CompetitionCategories.CompetitionAge(dateOfBirth, tournamentYear);

        /* An athlete with no file at all is missing everything, not nothing.
           Reading it the other way round showed "Complete" on the examination
           desk for someone who had uploaded not one document — exactly the
           wrong way for this to fail. */
        var missing = (medical ?? new AthleteMedicalFile()).Missing(age, gender);

        return new
        {
            e.Id,
            e.AthleteRegistrationId,
            reference = e.AthleteRegistration?.ReferenceNumber,
            membershipNumber = e.AthleteRegistration?.MembershipNumber,
            nameAr,
            nameEn,
            gender,
            dateOfBirth,
            competitionAge = age,
            e.Category,
            e.Track,
            e.DivisionId,
            divisionLabelAr = e.Division?.Describe(arabic: true),
            divisionLabelEn = e.Division?.Describe(arabic: false),
            e.DeclaredWeightKg,
            e.ActualWeightKg,
            e.HeightCm,
            e.ClubName,
            e.CoachName,
            e.Status,
            statusAr = EntryStatuses.Labels.TryGetValue(e.Status, out var l) ? l.Ar : e.Status,
            statusEn = EntryStatuses.Labels.TryGetValue(e.Status, out var l2) ? l2.En : e.Status,
            e.CheckedInAt,
            e.MedicalResult,
            e.MedicalNote,
            e.MedicalMissingDocumentsReason,
            e.WeighInResult,
            e.QualifiedAt,
            // A Passed that does not hold for the class the athlete is in now (DrawEligibility).
            staleWeighIn = DrawEligibility.StaleWeighIn(e, e.Division),
            e.EnteredBy,
            // REQ-08 rule 2 — the desk sees what is missing before it decides.
            medicalMissing = missing.Select(m => new { ar = m.Ar, en = m.En }),
            medicalComplete = missing.Count == 0,
        };
    }

    /// <summary>The stored weight-class selection, for the setup screen.</summary>
    private static Dictionary<string, List<decimal?>> ReadSelection(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, List<decimal?>>>(json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IResult Problem(TournamentService.Outcome outcome) => outcome.Code is null
        ? Results.Json(new
        {
            message = $"{outcome.MessageAr} / {outcome.MessageEn}",
            messageAr = outcome.MessageAr,
            messageEn = outcome.MessageEn,
        }, statusCode: outcome.Status)
        : Results.Json(new
        {
            message = $"{outcome.MessageAr} / {outcome.MessageEn}",
            messageAr = outcome.MessageAr,
            messageEn = outcome.MessageEn,
            code = outcome.Code,
        }, statusCode: outcome.Status);

    /// <summary>A refused draw change, with its code for the page to act on (DrawService.DrawRefusals).</summary>
    private static IResult DrawProblem(DrawService.DrawChange change) => Results.Json(new
    {
        message = $"{change.Result.MessageAr} / {change.Result.MessageEn}",
        messageAr = change.Result.MessageAr,
        messageEn = change.Result.MessageEn,
        code = change.Refusal,
    }, statusCode: change.Result.Status);
}

/* ── requests ───────────────────────────────────────────────────────────── */

public record TournamentSetupRequest(
    string NameAr, string NameEn, string Type, string CompetitionType,
    string LocationAr, string LocationEn,
    DateTime StartDate, DateTime EndDate,
    string? FirstBoutTime, DateTime? RegistrationClosesAt,
    List<string> Genders, List<string> Categories,
    Dictionary<string, List<decimal?>>? WeightClasses = null,
    string? DescriptionAr = null, string? DescriptionEn = null,
    bool? ExactWeightClasses = null,
    string? ActivityCategory = null,
    OnSiteScheduleRequest? OnSiteSchedule = null,
    string? TermsAr = null, string? TermsEn = null,
    BannerCropRequest? BannerImageCrop = null)
{
    public TournamentService.Setup ToSetup() => new(
        NameAr, NameEn, Type, CompetitionType, LocationAr, LocationEn,
        StartDate, EndDate,
        TimeSpan.TryParse(FirstBoutTime, out var time) ? time : new TimeSpan(17, 0, 0),
        RegistrationClosesAt, Genders ?? [], Categories ?? [],
        WeightClasses?.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<decimal?>)pair.Value),
        DescriptionAr, DescriptionEn, ExactWeightClasses ?? false, ActivityCategory,
        OnSiteSchedule is null ? null : new TournamentService.OnSiteWindow(OnSiteSchedule.StartsAt, OnSiteSchedule.EndsAt),
        TermsAr, TermsEn,
        BannerImageCrop is null ? null : new TournamentService.BannerPosition(
            BannerImageCrop.ImageUrl, BannerCrop.Normalise(BannerImageCrop.X, BannerImageCrop.Y, BannerImageCrop.Zoom)));
}

/// <summary>
/// How the banner is framed (see <see cref="BannerCrop"/>), and the image it
/// was chosen on. Absent leaves the stored position as it is.
/// </summary>
public record BannerCropRequest(double? X, double? Y, double? Zoom, string? ImageUrl = null);

/// <summary>Absent leaves the on-site window as it is; present sets it (nulls clear it).</summary>
public record OnSiteScheduleRequest(DateTime? StartsAt, DateTime? EndsAt);

public record LookupRequest(string? NameAr, string? NameEn);

public record StatusRequest(string Status);
public record RegistrationCloseRequest(DateTime ClosesAt);
public record ReasonRequest(string? Reason);

public record EntryRequest(
    int AthleteRegistrationId, int? DivisionId, string? Track, string? Category,
    decimal? DeclaredWeightKg, decimal? HeightCm,
    string? ClubName, string? TrainingCentre, string? CoachName, string? CoachPhone);

/// <param name="Reason">Required when the move clears a weigh-in result or Final Draw Approval.</param>
public record EntryAmendRequest(int? DivisionId, decimal? DeclaredWeightKg, string? Reason = null);
/// <param name="DocumentsMissing">Informational only: the server works out what is missing itself.</param>
/// <param name="MissingDocumentsReason">Required for a Passed result while required documents are missing.</param>
public record MedicalResultRequest(string Result, string? Note, bool DocumentsMissing, string? CorrectionReason = null,
    string? MissingDocumentsReason = null);
public record WeighInRequest(
    decimal? WeightKg, string? Result, int? MoveToDivisionId, bool NoShow, string? Reason = null);
public record WeighInMoveRequest(decimal WeightKg, int DivisionId, string? Reason = null);
public record DrawRequest(int? Seed, string? Reason);

/// <param name="ExpectedEntryIds">The athletes the administrator was shown; the draw is refused if the pool differs.</param>
/// <param name="DryRun">Run every check without generating anything.</param>
public record GenerateDrawRequest(List<int>? ExpectedEntryIds, bool DryRun = false);

/// <param name="DryRun">Run every check (reason, confirmation, both reviewed lists, protections) without regenerating.</param>
public record RegenerateDrawRequest(
    List<int>? ExpectedEntryIds, List<int>? ExpectedDrawEntryIds, string? Reason, bool Confirmed = false, bool DryRun = false,
    bool RevisePublished = false);

/// <summary>
/// Optional: the lists the publisher reviewed in the confirmation dialog. When given, publishing is
/// refused if the saved draw or the eligible list has changed since. The legacy draw page sends none.
/// </summary>
public record PublishDrawRequest(List<int>? ExpectedDrawEntryIds, List<int>? ExpectedEntryIds);
public record CornerRequest(string Corner, int? EntryId, string? Reason);
public record RingRequest(string Name, TimeSpan? FirstBoutTime, int? IntervalMinutes);
public record DivisionScheduleRequest(int? RingId, DateTime? Date, TimeSpan? FirstBoutTime, int? IntervalMinutes);
public record BoutSlotRequest(int? RingId, DateTime? Date);
public record GenerateRequest(int? BoutsPerAthletePerDay);
