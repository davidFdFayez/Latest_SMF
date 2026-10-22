using System.Security.Claims;
using System.Text.Json;
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
            AdminPermissions.TournamentSchedule);

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

            var result = await service.UpdateAsync(tournament, request.ToSetup(), AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage);

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

            var result = await service.ChangeStatusAsync(tournament, request.Status, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage);

        group.MapPost("/{id:int}/registration-closes", async (
            int id, RegistrationCloseRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var result = await service.ExtendRegistrationAsync(
                tournament, request.ClosesAt, AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(Summarise(tournament, 0)) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentManage);
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
                .Select(e => DescribeEntry(e, medical.FirstOrDefault(f => f.AthleteRegistrationId == e.AthleteRegistrationId))));
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
                entry, request.DivisionId, request.DeclaredWeightKg, AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { entry.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/withdraw", async (
            int entryId, ReasonRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService entries, DrawService draws, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var actor = AdminIdentity.Current(user);
            var result = await entries.WithdrawAsync(entry, request.Reason, actor, ct);
            if (!result.Ok) return Problem(result);

            // REQ-10 rules 7 and 8 — what that means for the bracket.
            await draws.ApplyWithdrawalAsync(entry, actor, ct);
            return Results.Ok(new { entry.Id, entry.Status });
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical);
    }

    /* ── REQ-08 / REQ-09: readiness ─────────────────────────────────────── */

    private static void MapReadiness(RouteGroupBuilder group)
    {
        group.MapPost("/entries/{entryId:int}/check-in", async (
            int entryId, ClaimsPrincipal user, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.CheckInAsync(entry, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { entry.Id, entry.Status, entry.CheckedInAt }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/medical", async (
            int entryId, MedicalResultRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.RecordMedicalAsync(
                entry, request.Result, request.Note, request.DocumentsMissing, AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { entry.Id, entry.Status, entry.MedicalResult }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapGet("/entries/{entryId:int}/weigh-in/preview", async (
            int entryId, decimal weightKg, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var view = await service.PreviewWeighInAsync(entry, weightKg, ct);
            return Results.Ok(new
            {
                view!.ActualWeightKg,
                view.WithinRegisteredClass,
                view.RegisteredClassLabel,
                view.ActualClassLabel,
                alternatives = view.Alternatives.Select(d => new
                {
                    d.Id, labelEn = d.Describe(false), labelAr = d.Describe(true),
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
                    request.MoveToDivisionId, actor, ct);

            return result.Ok
                ? Results.Ok(new { entry.Id, entry.Status, entry.WeighInResult, entry.ActualWeightKg, entry.DivisionId })
                : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/entries/{entryId:int}/approve", async (
            int entryId, ClaimsPrincipal user, SmfDbContext db,
            TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries.FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.ApproveReadinessAsync(entry, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { entry.Id, entry.Status, entry.QualifiedAt }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentDirector);
    }

    /* ── REQ-10: the draw ───────────────────────────────────────────────── */

    private static void MapDraw(RouteGroupBuilder group)
    {
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

            var (result, bouts) = await service.CreateAsync(
                division, AdminIdentity.Current(user), request.Seed, request.Reason, ct);

            return result.Ok ? Results.Ok(new { bouts }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentDraw);

        group.MapPost("/divisions/{divisionId:int}/draw/publish", async (
            int divisionId, ClaimsPrincipal user, SmfDbContext db,
            DrawService service, CancellationToken ct) =>
        {
            var division = await db.TournamentDivisions.FirstOrDefaultAsync(d => d.Id == divisionId, ct);
            if (division is null) return Results.NotFound();

            var result = await service.PublishAsync(division, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { division.Id, division.DrawPublishedAt }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentDrawApprove);

        group.MapPut("/bouts/{boutId:int}/corner", async (
            int boutId, CornerRequest request, ClaimsPrincipal user,
            SmfDbContext db, DrawService service, CancellationToken ct) =>
        {
            var bout = await db.Bouts.FirstOrDefaultAsync(b => b.Id == boutId, ct);
            if (bout is null) return Results.NotFound();

            var result = await service.AmendCornerAsync(
                bout, request.Corner, request.EntryId, request.Reason ?? string.Empty,
                AdminIdentity.Current(user), ct);

            return result.Ok ? Results.Ok(new { bout.Id }) : Problem(result);
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
    }

    /* ── shapes ─────────────────────────────────────────────────────────── */

    private static object Summarise(Tournament t, int entries) => new
    {
        t.Id,
        t.NameAr,
        t.NameEn,
        t.Type,
        t.CompetitionType,
        t.LocationAr,
        t.LocationEn,
        t.StartDate,
        t.EndDate,
        t.FirstBoutTime,
        t.RegistrationClosesAt,
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

    private static object DescribeEntry(TournamentEntry e, AthleteMedicalFile? medical)
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

        var age = dateOfBirth is { } dob ? DateTime.UtcNow.Year - dob.Year : (int?)null;

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
            e.WeighInResult,
            e.QualifiedAt,
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

    private static IResult Problem(TournamentService.Outcome outcome) => Results.Json(new
    {
        message = $"{outcome.MessageAr} / {outcome.MessageEn}",
        messageAr = outcome.MessageAr,
        messageEn = outcome.MessageEn,
    }, statusCode: outcome.Status);
}

/* ── requests ───────────────────────────────────────────────────────────── */

public record TournamentSetupRequest(
    string NameAr, string NameEn, string Type, string CompetitionType,
    string LocationAr, string LocationEn,
    DateTime StartDate, DateTime EndDate,
    string? FirstBoutTime, DateTime? RegistrationClosesAt,
    List<string> Genders, List<string> Categories,
    Dictionary<string, List<decimal?>>? WeightClasses = null)
{
    public TournamentService.Setup ToSetup() => new(
        NameAr, NameEn, Type, CompetitionType, LocationAr, LocationEn,
        StartDate, EndDate,
        TimeSpan.TryParse(FirstBoutTime, out var time) ? time : new TimeSpan(17, 0, 0),
        RegistrationClosesAt, Genders ?? [], Categories ?? [],
        WeightClasses?.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<decimal?>)pair.Value));
}

public record LookupRequest(string? NameAr, string? NameEn);

public record StatusRequest(string Status);
public record RegistrationCloseRequest(DateTime ClosesAt);
public record ReasonRequest(string? Reason);

public record EntryRequest(
    int AthleteRegistrationId, int? DivisionId, string? Track, string? Category,
    decimal? DeclaredWeightKg, decimal? HeightCm,
    string? ClubName, string? TrainingCentre, string? CoachName, string? CoachPhone);

public record EntryAmendRequest(int? DivisionId, decimal? DeclaredWeightKg);
public record MedicalResultRequest(string Result, string? Note, bool DocumentsMissing);
public record WeighInRequest(decimal? WeightKg, string? Result, int? MoveToDivisionId, bool NoShow);
public record DrawRequest(int? Seed, string? Reason);
public record CornerRequest(string Corner, int? EntryId, string? Reason);
public record RingRequest(string Name, TimeSpan? FirstBoutTime, int? IntervalMinutes);
public record DivisionScheduleRequest(int? RingId, DateTime? Date, TimeSpan? FirstBoutTime, int? IntervalMinutes);
public record BoutSlotRequest(int? RingId, DateTime? Date);
public record GenerateRequest(int? BoutsPerAthletePerDay);
