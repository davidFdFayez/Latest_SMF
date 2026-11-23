using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// Stage 5 — REQ-11 Bout Schedule, under /api/admin/tournaments/{id}/bout-schedule.
///
/// Every route checks its permission on the server, whatever the screen shows:
/// reading needs any scheduling role (edit, approve or the draw/manage roles
/// that already read the schedule); every change needs
/// <c>tournament.schedule</c>; moving a bout between rings or days also needs
/// <c>tournament.schedule.cross_ring</c> (checked in the service); approving
/// needs <c>tournament.schedule.approve</c> alone — an approver cannot edit,
/// an editor cannot approve; exceptions need <c>tournament.schedule.exceptions</c>.
/// Every change carries <c>expectedRevision</c>, refused when stale.
/// </summary>
public static class BoutScheduleEndpoints
{
    public sealed record RingBody(string? Name, bool? IsActive, int? MoveBy, int ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record AddRingBody(string Name, int? ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record RingDayBody(int RingId, DateTime Date, string FirstBoutTime, int IntervalMinutes, int ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record AssignBody(int DivisionId, int RingId, DateTime Date, List<int>? Rounds, int ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record MoveBody(DateTime Date, int RingId, int? Position, string? Reason, int ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record ReasonBody(string? Reason, int ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record RevisionBody(int? ExpectedRevision, string? ApprovalChangeReason = null);
    /// <param name="Time">Optional exact start time "HH:mm" (24-hour, one-minute precision); null = the time its place gives it.</param>
    public sealed record DivisionBoutBody(int BoutId, int? RingId, DateTime? Date, int? Position, string? Time = null);
    public sealed record DivisionTimingBody(int RingId, DateTime Date, string FirstBoutTime, int IntervalMinutes);
    public sealed record DivisionSaveBody(List<DivisionBoutBody>? Bouts, List<DivisionTimingBody>? Timing, int? DefaultRingId,
        string? Reason, bool Confirm, bool DryRun, int ExpectedRevision, string? ApprovalChangeReason = null);
    public sealed record ExceptionBody(List<int> AthleteIds, DateTime Date, int MaxBouts, string? Reason, int ExpectedRevision, string? ApprovalChangeReason = null);

    /// <summary>An exact bout time: 24-hour "HH:mm", one-minute precision.</summary>
    private static readonly System.Text.RegularExpressions.Regex ExactTime = new(@"^([01]\d|2[0-3]):[0-5]\d$");

    /// <summary>Who may open Bout Schedule (also who sees its notifications).</summary>
    internal static readonly string[] Readers =
    [
        AdminPermissions.TournamentSchedule, AdminPermissions.TournamentScheduleApprove,
        AdminPermissions.TournamentManage, AdminPermissions.TournamentDraw,
    ];

    private static IResult Refused(TournamentService.Outcome outcome, IEnumerable<ScheduleService.Issue>? issues = null) =>
        Results.Json(new
        {
            message = $"{outcome.MessageAr} / {outcome.MessageEn}",
            messageAr = outcome.MessageAr,
            messageEn = outcome.MessageEn,
            code = outcome.Code,
            issues = issues?.Select(i => new { i.Code, i.Severity, i.MessageEn, i.MessageAr, i.BoutIds, date = i.Date?.ToString("yyyy-MM-dd"), i.Subject, i.Potential }),
        }, statusCode: outcome.Status);

    public static void MapBoutSchedule(RouteGroupBuilder group)
    {
        var bs = group.MapGroup("/{id:int}/bout-schedule");

        bs.MapGet("", async (int id, ClaimsPrincipal user, SmfDbContext db, ScheduleService service, CancellationToken ct) =>
            await db.Tournaments.AnyAsync(t => t.Id == id, ct)
                ? Results.Ok(await service.Stage5ViewAsync(id, AdminIdentity.Current(user), ct))
                : Results.NotFound()).RequirePermission(Readers);

        bs.MapGet("/validation", async (int id, ScheduleService service, CancellationToken ct) =>
            Results.Ok(await service.ValidateAsync(id, ct))).RequirePermission(Readers);

        bs.MapGet("/history", async (int id, ScheduleService service, CancellationToken ct) =>
            Results.Ok(await service.HistoryAsync(id, ct))).RequirePermission(Readers);

        bs.MapPost("", async (int id, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            var result = await service.CreateDraftAsync(id, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { created = true }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/rings", async (int id, AddRingBody body, ClaimsPrincipal user, SmfDbContext db, ScheduleService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var (result, ring) = await service.AddRingAsync(tournament, body.Name, null, null, AdminIdentity.Current(user), ct, body.ExpectedRevision);
            return result.Ok ? Results.Ok(new { ring!.Id, ring.Name, ring.SortOrder }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPut("/rings/{ringId:int}", async (int id, int ringId, RingBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.UpdateRingStage5Async(id, ringId, body.Name, body.IsActive, body.MoveBy, body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { ringId }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapDelete("/rings/{ringId:int}", async (int id, int ringId, int? expectedRevision, string? approvalChangeReason, ClaimsPrincipal user, SmfDbContext db,
            ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = approvalChangeReason;
            var ring = await db.TournamentRings.FirstOrDefaultAsync(r => r.Id == ringId && r.TournamentId == id, ct);
            if (ring is null) return Results.NotFound();
            var result = await service.RemoveRingAsync(ring, AdminIdentity.Current(user), ct, expectedRevision);
            return result.Ok ? Results.Ok(new { removed = ringId }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPut("/ring-days", async (int id, RingDayBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            if (!TimeSpan.TryParse(body.FirstBoutTime, out var first))
                return Results.BadRequest(new { messageEn = "The first bout time must be HH:mm.", messageAr = "وقت البداية غير صالح." });
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.SetRingDayAsync(id, body.RingId, body.Date, first, body.IntervalMinutes, body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { saved = true }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/assign", async (int id, AssignBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var (result, count) = await service.AssignDivisionAsync(id, body.DivisionId, body.RingId, body.Date, body.Rounds,
                body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { assigned = count }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/bouts/{boutId:int}/move", async (int id, int boutId, MoveBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.MoveBoutStage5Async(id, boutId, body.Date, body.RingId, body.Position, body.Reason,
                body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { moved = boutId }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/bouts/{boutId:int}/unassign", async (int id, int boutId, ReasonBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.UnassignBoutAsync(id, boutId, body.Reason, body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { unassigned = boutId }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/submit", async (int id, RevisionBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            var (result, issues) = await service.SubmitForReviewAsync(id, body.ExpectedRevision ?? -1, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { status = ScheduleService.Statuses.Review }) : Refused(result, issues);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/approve", async (int id, RevisionBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            var (result, issues) = await service.ApproveAsync(id, body.ExpectedRevision, AdminIdentity.Current(user), ct, requireReview: true);
            return result.Ok ? Results.Ok(new { status = ScheduleService.Statuses.Approved }) : Refused(result, issues);
        }).RequirePermission(AdminPermissions.TournamentScheduleApprove);

        bs.MapPost("/withdraw-approval", async (int id, ReasonBody body, ClaimsPrincipal user, SmfDbContext db, ScheduleService service, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();
            var result = await service.WithdrawApprovalAsync(tournament, body.Reason, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { status = ScheduleService.Statuses.Draft }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentScheduleApprove);

        bs.MapPost("/source/acknowledge", async (int id, RevisionBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.AcknowledgeSourceAsync(id, body.ExpectedRevision ?? -1, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { acknowledged = true }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        // Step 3 — one tournament-wide Publish Schedule (assigns the official numbers) and an authorised Unpublish.
        bs.MapPost("/publish", async (int id, RevisionBody body, ClaimsPrincipal user, ScheduleService service,
            AdminNotificationService notifications, CancellationToken ct) =>
        {
            var (result, published, issues) = await service.PublishAsync(id, body.ExpectedRevision ?? -1, AdminIdentity.Current(user), ct);
            if (result.Ok) await notifications.SchedulePublishedAsync(id, ct); // resolves the notice once no update is required
            return result.Ok ? Results.Ok(published) : Refused(result, issues);
        }).RequirePermission(AdminPermissions.TournamentSchedulePublish);

        bs.MapPost("/unpublish", async (int id, ReasonBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            var result = await service.UnpublishAsync(id, body.Reason, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { unpublished = true }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentSchedulePublish);

        // Save Division Schedule (dry run = the same checks, rolled back, for the confirmation preview).
        bs.MapPost("/divisions/{divisionId:int}/save", async (int id, int divisionId, DivisionSaveBody body, ClaimsPrincipal user,
            ScheduleService service, CancellationToken ct) =>
        {
            var timing = new List<ScheduleService.DivisionTimingPlan>();
            foreach (var tp in body.Timing ?? [])
            {
                if (!TimeSpan.TryParse(tp.FirstBoutTime, out var first))
                    return Results.BadRequest(new { messageEn = "The first bout start time must be HH:mm.", messageAr = "وقت البداية غير صالح." });
                timing.Add(new ScheduleService.DivisionTimingPlan(tp.RingId, tp.Date, first, tp.IntervalMinutes));
            }
            // A multi-day tournament has no default date: every bout needs one chosen before the division can be saved.
            var incomplete = (body.Bouts ?? []).Where(b => b.Date is null || b.RingId is null || b.Position is null).ToList();
            if (incomplete.Count > 0)
            {
                var noDate = incomplete.Where(b => b.Date is null).Select(b => b.BoutId).ToList();
                return Results.Json(new
                {
                    message = "اختر حلبة وتاريخًا لكل نزال. / Every bout needs a ring and a date before the division can be saved.",
                    messageAr = "اختر حلبة وتاريخًا لكل نزال.",
                    messageEn = noDate.Count > 0
                        ? $"{noDate.Count} bout(s) have no date yet. Choose a date for every bout before saving."
                        : "Every bout needs a ring and a date before the division can be saved.",
                    code = noDate.Count > 0 ? "missing_date" : "incomplete_plan",
                    issues = new[] { new { code = "missing_date", severity = "blocking", messageEn = "Bouts without a date or ring.",
                        messageAr = "نزالات بلا تاريخ أو حلبة.", boutIds = incomplete.Select(b => b.BoutId).ToList() } },
                }, statusCode: 400);
            }
            // An exact time is taken exactly as entered, or refused — never rounded or adjusted.
            var badTime = (body.Bouts ?? []).FirstOrDefault(b => b.Time is not null && !ExactTime.IsMatch(b.Time));
            if (badTime is not null)
                return Results.BadRequest(new
                {
                    code = "invalid_time", boutId = badTime.BoutId,
                    messageEn = $"\"{badTime.Time}\" is not a valid time. Enter the time as HH:mm (00:00–23:59), for example 09:07.",
                    messageAr = "الوقت غير صالح. أدخله بصيغة HH:mm (من 00:00 إلى 23:59).",
                });
            var plan = (body.Bouts ?? []).Select(b => new ScheduleService.DivisionBoutPlan(b.BoutId, b.RingId!.Value, b.Date!.Value, b.Position!.Value,
                b.Time is null ? null : TimeSpan.ParseExact(b.Time, @"hh\:mm", System.Globalization.CultureInfo.InvariantCulture))).ToList();
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var (result, preview, issues) = await service.SaveDivisionAsync(id, divisionId, plan, timing, body.DefaultRingId, body.Reason,
                body.Confirm, body.DryRun, body.ExpectedRevision, AdminIdentity.Current(user), ct);
            if (result.Ok) return Results.Ok(new { saved = !body.DryRun, preview });
            return Results.Json(new
            {
                message = $"{result.MessageAr} / {result.MessageEn}", messageAr = result.MessageAr, messageEn = result.MessageEn, code = result.Code,
                issues = issues.Select(i => new { i.Code, i.Severity, i.MessageEn, i.MessageAr, i.BoutIds, date = i.Date?.ToString("yyyy-MM-dd"), i.Subject, i.Potential }), preview,
            }, statusCode: result.Status);
        }).RequirePermission(AdminPermissions.TournamentSchedule);

        bs.MapPost("/exceptions", async (int id, ExceptionBody body, ClaimsPrincipal user, ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.GrantExceptionAsync(id, body.AthleteIds ?? [], body.Date, body.MaxBouts, body.Reason,
                body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { granted = body.AthleteIds?.Count ?? 0 }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentScheduleExceptions);

        bs.MapPost("/exceptions/{exceptionId:int}/revoke", async (int id, int exceptionId, ReasonBody body, ClaimsPrincipal user,
            ScheduleService service, CancellationToken ct) =>
        {
            service.ApprovalChangeReason = body.ApprovalChangeReason;
            var result = await service.RevokeExceptionAsync(id, exceptionId, body.Reason, body.ExpectedRevision, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { revoked = exceptionId }) : Refused(result);
        }).RequirePermission(AdminPermissions.TournamentScheduleExceptions);
    }
}
