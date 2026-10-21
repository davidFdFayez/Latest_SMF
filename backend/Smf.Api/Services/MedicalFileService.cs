using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// The athlete's medical file — Phase 3 REQ-04.
///
/// Two rules shape everything here and they pull in opposite directions, which
/// is the point:
///
/// <list type="bullet">
/// <item><b>Nothing here blocks an entry</b> (rule 6). An athlete may enter
/// with an empty file. What an empty file blocks is competing, at the
/// examination desk.</item>
/// <item><b>Changing a document afterwards does not take effect on its own</b>
/// (rule 5). A new certificate waits for an authorised user to accept it, so
/// an athlete cannot replace a failed test an hour before the weigh-in.</item>
/// </list>
///
/// The second only applies once a file has been accepted: the first upload is
/// simply the file, and there is nothing yet to protect.
/// </summary>
public class MedicalFileService(SmfDbContext db, AuditLogger audit)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>What an athlete or a club sends when filling the file in.</summary>
    public sealed record Submission(
        string? CertificateAttachmentId,
        DateTime? CertificateDate,
        string? ScreeningAttachmentId,
        DateTime? ScreeningDate,
        Dictionary<string, bool>? HealthAnswers,
        string? Medications,
        Dictionary<string, bool>? Declarations,
        bool? NotPregnantDeclared,
        string? GuardianConsentAttachmentId);

    public async Task<AthleteMedicalFile> GetOrCreateAsync(
        int athleteRegistrationId,
        CancellationToken cancellationToken = default)
    {
        var file = await db.AthleteMedicalFiles
            .FirstOrDefaultAsync(f => f.AthleteRegistrationId == athleteRegistrationId, cancellationToken);

        if (file is not null) return file;

        file = new AthleteMedicalFile { AthleteRegistrationId = athleteRegistrationId };
        db.AthleteMedicalFiles.Add(file);
        await db.SaveChangesAsync(cancellationToken);

        return file;
    }

    /// <summary>
    /// Records what the athlete submitted.
    ///
    /// Health answers, declarations and the pregnancy tick apply at once —
    /// they are the athlete's own statements and nobody else has to agree to
    /// them. The two documents are different: once a file has been accepted,
    /// a replacement is held as a pending change until an authorised user
    /// approves it (rule 5).
    /// </summary>
    public async Task<Outcome> SubmitAsync(
        AthleteMedicalFile file,
        Submission submission,
        bool selfService,
        AdminIdentity.Actor? actor,
        CancellationToken cancellationToken = default)
    {
        if (submission.HealthAnswers is { } answers)
        {
            var unknown = answers.Keys.FirstOrDefault(k => HealthQuestions.All.All(q => q.Key != k));
            if (unknown is not null)
                return Outcome.Invalid($"سؤال غير معروف: {unknown}.", $"Unknown question: {unknown}.");

            file.HealthAnswersJson = JsonSerializer.Serialize(answers, Json);

            // Rule 2(ix) — a yes to the medication question opens a box, and
            // the name belongs with the answer.
            file.Medications = answers.TryGetValue(HealthQuestions.MedicationKey, out var taking) && taking
                ? submission.Medications
                : null;
        }

        if (submission.Declarations is { } declarations)
        {
            var unknown = declarations.Keys.FirstOrDefault(k => AthleteDeclarations.All.All(d => d.Key != k));
            if (unknown is not null)
                return Outcome.Invalid($"إقرار غير معروف: {unknown}.", $"Unknown declaration: {unknown}.");

            file.DeclarationsJson = JsonSerializer.Serialize(declarations, Json);
        }

        if (submission.NotPregnantDeclared is not null)
            file.NotPregnantDeclared = submission.NotPregnantDeclared;

        if (submission.GuardianConsentAttachmentId is not null)
            file.GuardianConsentAttachmentId = submission.GuardianConsentAttachmentId;

        /* Rule 5 says a *later* update needs approval. What makes an update
           later is that there is already a document to replace — not that
           somebody once pressed approve. Reading it the other way would leave
           a file nobody had explicitly accepted wide open, which is exactly
           the case the rule exists for. */
        var replacesCertificate =
            submission.CertificateAttachmentId is not null && file.HasCertificate;
        var replacesScreening =
            submission.ScreeningAttachmentId is not null
            && !string.IsNullOrWhiteSpace(file.ScreeningAttachmentId);

        if (selfService && (replacesCertificate || replacesScreening))
        {
            // Rule 5 — held, not applied.
            file.PendingChangeJson = JsonSerializer.Serialize(new
            {
                CertificateAttachmentId = replacesCertificate ? submission.CertificateAttachmentId : null,
                CertificateDate = replacesCertificate ? submission.CertificateDate : null,
                ScreeningAttachmentId = replacesScreening ? submission.ScreeningAttachmentId : null,
                ScreeningDate = replacesScreening ? submission.ScreeningDate : null,
            }, Json);
            file.PendingChangeAt = DateTime.UtcNow;

            // Whichever half was a first upload still applies at once.
            Apply(file,
                replacesCertificate ? null : submission.CertificateAttachmentId,
                replacesCertificate ? null : submission.CertificateDate,
                replacesScreening ? null : submission.ScreeningAttachmentId,
                replacesScreening ? null : submission.ScreeningDate);
        }
        else
        {
            Apply(file, submission.CertificateAttachmentId, submission.CertificateDate,
                submission.ScreeningAttachmentId, submission.ScreeningDate);
        }

        file.UpdatedAt = DateTime.UtcNow;

        if (actor is not null)
        {
            audit.Write(actor, AuditActions.MedicalFileUpdated, "athlete_medical_file", file.Id,
                details: file.PendingChangeAt is null ? "Applied." : "Held pending approval.");
        }

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>Accepts a held change — rule 5's other half.</summary>
    public async Task<Outcome> ApprovePendingAsync(
        AthleteMedicalFile file,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (file.PendingChangeJson is null)
            return Outcome.Conflict("لا يوجد تحديث بانتظار الاعتماد.", "There is no pending change.");

        var pending = JsonSerializer.Deserialize<PendingChange>(file.PendingChangeJson, Json);
        if (pending is not null)
        {
            Apply(file, pending.CertificateAttachmentId, pending.CertificateDate,
                pending.ScreeningAttachmentId, pending.ScreeningDate);
        }

        file.PendingChangeJson = null;
        file.PendingChangeAt = null;
        file.ApprovedAt = DateTime.UtcNow;
        file.ApprovedBy = actor.Username;
        file.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.MedicalFileUpdated, "athlete_medical_file", file.Id,
            details: "Pending medical documents approved.");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    public async Task<Outcome> RejectPendingAsync(
        AthleteMedicalFile file,
        string? reason,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (file.PendingChangeJson is null)
            return Outcome.Conflict("لا يوجد تحديث بانتظار الاعتماد.", "There is no pending change.");

        file.PendingChangeJson = null;
        file.PendingChangeAt = null;
        file.UpdatedAt = DateTime.UtcNow;

        audit.Write(actor, AuditActions.MedicalFileUpdated, "athlete_medical_file", file.Id,
            details: $"Pending medical documents rejected. {reason}");
        await db.SaveChangesAsync(cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// REQ-08 rule 3 — the examination desk may upload what is missing while
    /// the athlete stands in front of them. That is not a self-service change
    /// and does not wait for anybody.
    /// </summary>
    public Task<Outcome> UploadAtDeskAsync(
        AthleteMedicalFile file,
        string? certificateAttachmentId,
        DateTime? certificateDate,
        string? screeningAttachmentId,
        DateTime? screeningDate,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default) =>
        SubmitAsync(file, new Submission(
            certificateAttachmentId, certificateDate, screeningAttachmentId, screeningDate,
            null, null, null, null, null), selfService: false, actor, cancellationToken);

    /// <summary>The file as a screen needs it, with what is still missing spelled out.</summary>
    public object Describe(AthleteMedicalFile file, int? age, string? gender)
    {
        var answers = Read<Dictionary<string, bool>>(file.HealthAnswersJson) ?? [];
        var declarations = Read<Dictionary<string, bool>>(file.DeclarationsJson) ?? [];
        var missing = file.Missing(age, gender);

        return new
        {
            file.Id,
            file.AthleteRegistrationId,
            file.CertificateAttachmentId,
            file.CertificateDate,
            file.ScreeningAttachmentId,
            file.ScreeningDate,
            // Rule 1 — the screening section only appears above 15.
            screeningRequired = age is > 15,
            questions = HealthQuestions.All.Select(q => new
            {
                q.Key,
                q.Ar,
                q.En,
                q.AsksForDetail,
                answer = answers.TryGetValue(q.Key, out var value) ? value : (bool?)null,
            }),
            file.Medications,
            declarations = AthleteDeclarations.All.Select(d => new
            {
                d.Key,
                d.Ar,
                d.En,
                accepted = declarations.TryGetValue(d.Key, out var value) && value,
            }),
            // Rule 3 — who sees which consent.
            declarationsApply = age is >= 18,
            pregnancyDeclarationApplies = age is >= 18 && gender == "female",
            guardianConsentApplies = age is not null && age < 18,
            file.NotPregnantDeclared,
            file.GuardianConsentAttachmentId,
            file.ApprovedAt,
            file.ApprovedBy,
            hasPendingChange = file.PendingChangeJson is not null,
            file.PendingChangeAt,
            missing = missing.Select(m => new { ar = m.Ar, en = m.En }),
            complete = missing.Count == 0,
            // Rule 6, in the federation's own words.
            noticeAr = "جميع الحقول والأسئلة والمستندات والإقرارات والموافقات أعلاه اختيارية أثناء التسجيل، "
                       + "ولن يمنعك عدم استكمالها من التسجيل في البطولة. يجب استكمال المتطلبات المطلوبة قبل "
                       + "الفحص الطبي، وإلا لن يسمح لك بالمنافسة.",
            noticeEn = "Everything above is optional while entering and will not stop you entering the "
                       + "tournament. It has to be complete before the medical examination, or you will "
                       + "not be allowed to compete.",
        };
    }

    private static void Apply(
        AthleteMedicalFile file,
        string? certificateId, DateTime? certificateDate,
        string? screeningId, DateTime? screeningDate)
    {
        if (certificateId is not null) file.CertificateAttachmentId = certificateId;
        if (certificateDate is not null) file.CertificateDate = certificateDate;
        if (screeningId is not null) file.ScreeningAttachmentId = screeningId;
        if (screeningDate is not null) file.ScreeningDate = screeningDate;
    }

    private static T? Read<T>(string? json) where T : class
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            return JsonSerializer.Deserialize<T>(json, Json);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record PendingChange(
        string? CertificateAttachmentId,
        DateTime? CertificateDate,
        string? ScreeningAttachmentId,
        DateTime? ScreeningDate);
}
