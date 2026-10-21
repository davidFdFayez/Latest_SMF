using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The medical file and medical suspensions — Phase 3 REQ-04, and REQ-03
/// rule 3's source of truth.
/// </summary>
public static class MedicalEndpoints
{
    public static void MapMedicalAdmin(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/athletes").WithTags("Athlete medical");

        /// The questions and declarations, so no screen hard-codes them.
        group.MapGet("/medical/form", () => Results.Ok(new
        {
            questions = HealthQuestions.All.Select(q => new { q.Key, q.Ar, q.En, q.AsksForDetail }),
            declarations = AthleteDeclarations.All.Select(d => new { d.Key, d.Ar, d.En }),
            screeningFromAge = 16,
            suspensionReasons = SuspensionReasons.Labels.Select(r => new
            {
                value = r.Key, ar = r.Value.Ar, en = r.Value.En,
            }),
        })).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentEntries,
            AdminPermissions.TournamentManage);

        group.MapGet("/{athleteId:int}/medical", async (
            int athleteId, SmfDbContext db, MedicalFileService service, CancellationToken ct) =>
        {
            var athlete = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            var file = await service.GetOrCreateAsync(athleteId, ct);
            var (age, gender) = Describe(athlete);

            return Results.Ok(service.Describe(file, age, gender));
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentEntries);

        group.MapPut("/{athleteId:int}/medical", async (
            int athleteId, MedicalSubmissionRequest request, ClaimsPrincipal user,
            SmfDbContext db, MedicalFileService service, CancellationToken ct) =>
        {
            var athlete = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            var file = await service.GetOrCreateAsync(athleteId, ct);

            // An administrator filling this in is not a self-service change,
            // so it applies rather than queueing for their own approval.
            var result = await service.SubmitAsync(file, request.ToSubmission(),
                selfService: false, AdminIdentity.Current(user), ct);

            if (!result.Ok) return Problem(result);

            var (age, gender) = Describe(athlete);
            return Results.Ok(service.Describe(file, age, gender));
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentEntries);

        /// The same consent form, for a desk that needs to hand one over.
        group.MapGet("/{athleteId:int}/medical/guardian-consent", async (
            int athleteId, SmfDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var athlete = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            var (age, gender) = Describe(athlete);

            var entry = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Tournament)
                .Where(e => e.AthleteRegistrationId == athleteId)
                .OrderByDescending(e => e.CreatedAt)
                .FirstOrDefaultAsync(ct);

            var html = GuardianConsentForm.Render(
                RegistrationPayload.DisplayName(
                    System.Text.Json.JsonDocument.Parse(athlete.PayloadJson).RootElement, true)
                    ?? athlete.ReferenceNumber,
                athlete.MembershipNumber,
                entry?.Tournament?.NameAr,
                includePregnancyDeclaration: gender == "female" && age is < 18);

            http.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
            return Results.Content(html, "text/html; charset=utf-8");
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentEntries);

        group.MapPost("/{athleteId:int}/medical/approve", async (
            int athleteId, ClaimsPrincipal user, SmfDbContext db,
            MedicalFileService service, CancellationToken ct) =>
        {
            var file = await db.AthleteMedicalFiles
                .FirstOrDefaultAsync(f => f.AthleteRegistrationId == athleteId, ct);
            if (file is null) return Results.NotFound();

            var result = await service.ApprovePendingAsync(file, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { file.Id, file.ApprovedAt }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/{athleteId:int}/medical/reject", async (
            int athleteId, ReasonRequest request, ClaimsPrincipal user,
            SmfDbContext db, MedicalFileService service, CancellationToken ct) =>
        {
            var file = await db.AthleteMedicalFiles
                .FirstOrDefaultAsync(f => f.AthleteRegistrationId == athleteId, ct);
            if (file is null) return Results.NotFound();

            var result = await service.RejectPendingAsync(file, request.Reason, AdminIdentity.Current(user), ct);
            return result.Ok ? Results.Ok(new { file.Id }) : Problem(result);
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        /* ── suspensions (REQ-03 rule 3) ────────────────────────────────── */

        group.MapGet("/{athleteId:int}/suspensions", async (
            int athleteId, SmfDbContext db, CancellationToken ct) =>
        {
            var suspensions = await db.MedicalSuspensions.AsNoTracking()
                .Where(s => s.AthleteRegistrationId == athleteId)
                .OrderByDescending(s => s.StartsOn)
                .ToListAsync(ct);

            var now = DateTime.UtcNow;
            return Results.Ok(suspensions.Select(s => new
            {
                s.Id, s.Reason,
                reasonAr = SuspensionReasons.Labels[s.Reason].Ar,
                reasonEn = SuspensionReasons.Labels[s.Reason].En,
                s.StartsOn, s.EndsOn, s.Notes, s.LiftedAt, s.LiftedBy, s.LiftedReason,
                isActive = s.IsActive(now),
            }));
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentEntries);

        group.MapPost("/{athleteId:int}/suspensions", async (
            int athleteId, SuspensionRequest request, ClaimsPrincipal user,
            SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var athlete = await db.Registrations.FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            if (!SuspensionReasons.Labels.ContainsKey(request.Reason))
                return Results.BadRequest(new { message = "Unknown reason." });

            if (request.EndsOn is { } ends && ends.Date < request.StartsOn.Date)
                return Results.BadRequest(new { message = "The suspension ends before it starts." });

            var actor = AdminIdentity.Current(user);
            var suspension = new MedicalSuspension
            {
                AthleteRegistrationId = athleteId,
                Reason = request.Reason,
                StartsOn = request.StartsOn.Date,
                EndsOn = request.EndsOn?.Date,
                Notes = request.Notes,
                CreatedBy = actor.Username,
            };

            db.MedicalSuspensions.Add(suspension);
            audit.Registration(actor, AuditActions.SuspensionAdded, athlete,
                details: $"{request.Reason} from {request.StartsOn:yyyy-MM-dd}"
                         + (request.EndsOn is null ? " (open-ended)." : $" to {request.EndsOn:yyyy-MM-dd}."));

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { suspension.Id });
        }).RequirePermission(AdminPermissions.TournamentTechnical);

        group.MapPost("/suspensions/{suspensionId:int}/lift", async (
            int suspensionId, ReasonRequest request, ClaimsPrincipal user,
            SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var suspension = await db.MedicalSuspensions
                .Include(s => s.AthleteRegistration)
                .FirstOrDefaultAsync(s => s.Id == suspensionId, ct);
            if (suspension is null) return Results.NotFound();

            if (string.IsNullOrWhiteSpace(request.Reason))
            {
                return Results.Json(new
                {
                    message = "رفع الإيقاف الطبي يتطلب ذكر السبب. / Lifting a medical suspension requires a reason.",
                    messageAr = "رفع الإيقاف الطبي يتطلب ذكر السبب.",
                    messageEn = "Lifting a medical suspension requires a reason.",
                }, statusCode: StatusCodes.Status400BadRequest);
            }

            var actor = AdminIdentity.Current(user);
            suspension.LiftedAt = DateTime.UtcNow;
            suspension.LiftedBy = actor.Username;
            suspension.LiftedReason = request.Reason;

            if (suspension.AthleteRegistration is { } athlete)
                audit.Registration(actor, AuditActions.SuspensionLifted, athlete, details: request.Reason);

            await db.SaveChangesAsync(ct);
            return Results.Ok(new { suspension.Id, suspension.LiftedAt });
        }).RequirePermission(AdminPermissions.TournamentTechnical);
    }

    /// <summary>Age in the current year, and gender, from the membership payload.</summary>
    private static (int? Age, string? Gender) Describe(Registration athlete)
    {
        var dateOfBirth = TournamentEligibility.DateOfBirthOf(athlete);
        var age = dateOfBirth is { } dob ? DateTime.UtcNow.Year - dob.Year : (int?)null;
        return (age, TournamentEligibility.GenderOf(athlete));
    }

    private static IResult Problem(TournamentService.Outcome outcome) => Results.Json(new
    {
        message = $"{outcome.MessageAr} / {outcome.MessageEn}",
        messageAr = outcome.MessageAr,
        messageEn = outcome.MessageEn,
    }, statusCode: outcome.Status);
}

public record MedicalSubmissionRequest(
    string? CertificateAttachmentId,
    DateTime? CertificateDate,
    string? ScreeningAttachmentId,
    DateTime? ScreeningDate,
    Dictionary<string, bool>? HealthAnswers,
    string? Medications,
    Dictionary<string, bool>? Declarations,
    bool? NotPregnantDeclared,
    string? GuardianConsentAttachmentId)
{
    public MedicalFileService.Submission ToSubmission() => new(
        CertificateAttachmentId, CertificateDate, ScreeningAttachmentId, ScreeningDate,
        HealthAnswers, Medications, Declarations, NotPregnantDeclared, GuardianConsentAttachmentId);
}

public record SuspensionRequest(string Reason, DateTime StartsOn, DateTime? EndsOn, string? Notes);
