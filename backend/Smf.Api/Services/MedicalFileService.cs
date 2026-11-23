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
        string? GuardianConsentAttachmentId,
        string? PregnancyDeclarationAttachmentId = null);

    /// <summary>
    /// What the technical team may change at the examination desk: the health
    /// answers (null clears one to "not answered"), the medication details,
    /// and the electronic declarations. Documents are not here — a signed
    /// form is replaced through the document upload, never edited.
    /// </summary>
    public sealed record TechnicalEdit(
        Dictionary<string, bool?>? HealthAnswers,
        string? Medications,
        Dictionary<string, bool>? Declarations,
        bool? NotPregnantDeclared);

    /// <summary>
    /// The technical team corrects the athlete's own Medical File from the
    /// examination desk. It is the same file the athlete keeps — no tournament
    /// copy. Declarations are taken only where they apply at this competition
    /// age and gender. The examination result is not touched. The audit line
    /// says what was changed, not what the answers are.
    /// </summary>
    public async Task<Outcome> EditByTechnicalAsync(
        AthleteMedicalFile file,
        TechnicalEdit edit,
        int? age,
        string? gender,
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        bool afterFinalApproval = false)
    {
        var adult = age is >= 18;
        var changes = new List<string>();

        if (edit.HealthAnswers is { } answers)
        {
            var unknown = answers.Keys.FirstOrDefault(k => HealthQuestions.All.All(q => q.Key != k));
            if (unknown is not null) return Outcome.Invalid($"سؤال غير معروف: {unknown}.", $"Unknown question: {unknown}.");

            var current = file.Answers();
            var changed = 0;
            foreach (var (key, value) in answers)
            {
                var had = current.TryGetValue(key, out var was) ? was : (bool?)null;
                if (had == value) continue;
                changed++;
                if (value is { } v) current[key] = v;
                else current.Remove(key);
            }
            if (changed > 0)
            {
                file.HealthAnswersJson = JsonSerializer.Serialize(current, Json);
                changes.Add($"health answers changed ({changed})");
            }
        }

        // The details belong with a yes to the medication question, as on the
        // athlete's own form.
        var taking = file.Answers().TryGetValue(HealthQuestions.MedicationKey, out var t) && t;
        var medications = taking && !string.IsNullOrWhiteSpace(edit.Medications) ? edit.Medications.Trim() : null;
        if (medications is { Length: > 500 })
            return Outcome.Invalid("التفاصيل أطول من 500 حرف.", "Keep the medication details to 500 characters.");
        if (edit.Medications is not null || !taking)
        {
            var next = edit.Medications is null ? (taking ? file.Medications : null) : medications;
            if (next != file.Medications)
            {
                file.Medications = next;
                changes.Add("medication details changed");
            }
        }

        if (edit.Declarations is { Count: > 0 } declarations)
        {
            if (!adult)
            {
                return Outcome.Invalid(
                    "الإقرارات الإلكترونية لا تنطبق على من هم دون 18 عامًا.",
                    "The electronic declarations do not apply under 18; the signed forms do.");
            }
            var unknown = declarations.Keys.FirstOrDefault(k => AthleteDeclarations.All.All(d => d.Key != k));
            if (unknown is not null) return Outcome.Invalid($"إقرار غير معروف: {unknown}.", $"Unknown declaration: {unknown}.");

            var current = file.Declared();
            var changedKeys = declarations
                .Where(pair => (current.TryGetValue(pair.Key, out var was) ? was : (bool?)null) != pair.Value)
                .Select(pair => pair.Key)
                .ToList();
            foreach (var key in changedKeys) current[key] = declarations[key];
            if (changedKeys.Count > 0)
            {
                file.DeclarationsJson = JsonSerializer.Serialize(current, Json);
                changes.Add("declarations changed: " + string.Join(", ", changedKeys));
            }
        }

        if (edit.NotPregnantDeclared is { } notPregnant)
        {
            if (!(adult && gender == "female"))
            {
                return Outcome.Invalid(
                    "إقرار عدم الحمل الإلكتروني لا ينطبق على هذه اللاعبة.",
                    "The electronic non-pregnancy declaration does not apply to this athlete.");
            }
            if (file.NotPregnantDeclared != notPregnant)
            {
                file.NotPregnantDeclared = notPregnant;
                changes.Add("electronic non-pregnancy declaration changed");
            }
        }

        if (changes.Count == 0) return Outcome.Success();

        file.UpdatedAt = DateTime.UtcNow;
        audit.Write(actor, AuditActions.MedicalFileEdited, "athlete_medical_file", file.Id,
            entityRef: $"entry #{entry.Id}",
            details: $"Edited at the examination desk for athlete #{file.AthleteRegistrationId}, entry #{entry.Id}, "
                     + $"tournament #{entry.TournamentId}: {string.Join("; ", changes)}."
                     + (afterFinalApproval ? " Made after Final Approval (director)." : ""));
        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

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

            // Answers given now join those given before: an athlete finishing
            // the questions they skipped does not erase the ones they answered.
            var merged = file.Answers();
            foreach (var (key, value) in answers) merged[key] = value;
            file.HealthAnswersJson = JsonSerializer.Serialize(merged, Json);

            // Rule 2(ix) — a yes to the medication question opens a box, and
            // the name belongs with the answer.
            if (answers.TryGetValue(HealthQuestions.MedicationKey, out var taking))
                file.Medications = taking ? submission.Medications : null;
        }

        if (submission.Declarations is { } declarations)
        {
            var unknown = declarations.Keys.FirstOrDefault(k => AthleteDeclarations.All.All(d => d.Key != k));
            if (unknown is not null)
                return Outcome.Invalid($"إقرار غير معروف: {unknown}.", $"Unknown declaration: {unknown}.");

            var merged = file.Declared();
            foreach (var (key, value) in declarations) merged[key] = value;
            file.DeclarationsJson = JsonSerializer.Serialize(merged, Json);
        }

        if (submission.NotPregnantDeclared is not null)
            file.NotPregnantDeclared = submission.NotPregnantDeclared;

        // Which slots this submission puts a document in at once, for the
        // approval record below.
        var appliedNow = new List<string>();

        if (submission.GuardianConsentAttachmentId is not null)
        {
            file.GuardianConsentAttachmentId = submission.GuardianConsentAttachmentId;
            appliedNow.Add(MedicalDocumentSlots.GuardianConsent);
        }

        if (submission.PregnancyDeclarationAttachmentId is not null)
        {
            file.PregnancyDeclarationAttachmentId = submission.PregnancyDeclarationAttachmentId;
            appliedNow.Add(MedicalDocumentSlots.PregnancyDeclaration);
        }

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
            if (!replacesCertificate && submission.CertificateAttachmentId is not null)
                appliedNow.Add(MedicalDocumentSlots.Certificate);
            if (!replacesScreening && submission.ScreeningAttachmentId is not null)
                appliedNow.Add(MedicalDocumentSlots.Screening);
        }
        else
        {
            Apply(file, submission.CertificateAttachmentId, submission.CertificateDate,
                submission.ScreeningAttachmentId, submission.ScreeningDate);
            if (submission.CertificateAttachmentId is not null) appliedNow.Add(MedicalDocumentSlots.Certificate);
            if (submission.ScreeningAttachmentId is not null) appliedNow.Add(MedicalDocumentSlots.Screening);
        }

        foreach (var slot in appliedNow)
        {
            if (selfService)
            {
                // The athlete's own document is in use, but nobody approved it.
                file.ClearApproval(slot);
            }
            else if (actor is not null)
            {
                // An authorised user's document is approved as it is stored,
                // and an older replacement still waiting must not overwrite it.
                file.SetApproval(slot, actor.Username, DateTime.UtcNow);
                DropPending(file, slot);
            }
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
            if (pending.CertificateAttachmentId is not null)
                file.SetApproval(MedicalDocumentSlots.Certificate, actor.Username, DateTime.UtcNow);
            if (pending.ScreeningAttachmentId is not null)
                file.SetApproval(MedicalDocumentSlots.Screening, actor.Username, DateTime.UtcNow);
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

    /// <summary>What an administrator's upload did, for the screen and the audit line.</summary>
    public sealed record AdminUpload(bool Replaced, string? PreviousAttachmentId, string? SupersededPendingAttachmentId);

    /// <summary>
    /// An authorised administrator stores a medical document on the athlete's
    /// own Medical File from the Participants page. Unlike an athlete's
    /// replacement it does not wait: it becomes the document in use and is
    /// approved in the same save. If the athlete had a replacement for the
    /// same slot still waiting, that replacement is older than this upload and
    /// is withdrawn here — approving it later must not overwrite this one. A
    /// pending replacement for the other slot is left as it is.
    ///
    /// The attachment is stored before this is called; nothing here changes
    /// until the single save at the end, so a failure leaves the file as it was.
    /// </summary>
    public async Task<(Outcome Result, AdminUpload? Upload)> UploadByAdminAsync(
        AthleteMedicalFile file,
        string slot,
        string attachmentId,
        DateTime? documentDate,
        TournamentEntry entry,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default,
        bool afterFinalApproval = false)
    {
        var previous = file.AttachmentIn(slot);
        switch (slot)
        {
            case MedicalDocumentSlots.Certificate:
                file.CertificateAttachmentId = attachmentId;
                file.CertificateDate = documentDate;
                break;
            case MedicalDocumentSlots.Screening:
                file.ScreeningAttachmentId = attachmentId;
                file.ScreeningDate = documentDate;
                break;
            case MedicalDocumentSlots.GuardianConsent:
                file.GuardianConsentAttachmentId = attachmentId;
                break;
            case MedicalDocumentSlots.PregnancyDeclaration:
                file.PregnancyDeclarationAttachmentId = attachmentId;
                break;
            default:
                return (Outcome.Invalid("نوع مستند غير معروف.", "Unknown document type."), null);
        }

        var superseded = DropPending(file, slot);
        var now = DateTime.UtcNow;
        file.SetApproval(slot, actor.Username, now);
        file.UpdatedAt = now;

        var replaced = !string.IsNullOrWhiteSpace(previous);
        audit.Write(actor,
            replaced ? AuditActions.MedicalDocumentReplaced : AuditActions.MedicalDocumentUploaded,
            "athlete_medical_file", file.Id,
            entityRef: slot,
            fromStatus: replaced ? previous : null,
            toStatus: attachmentId,
            details: $"Participants: {(replaced ? "replaced" : "uploaded")} {slot} for athlete #{file.AthleteRegistrationId}, "
                     + $"tournament #{entry.TournamentId}, entry #{entry.Id}. "
                     + $"Previous attachment: {previous ?? "none"}; new attachment: {attachmentId}. "
                     + "Approved immediately (authorised administrator upload)."
                     + (superseded is null ? "" : $" Superseded the athlete's pending replacement {superseded}.")
                     + (afterFinalApproval ? " Made after Final Approval (director)." : ""));

        await db.SaveChangesAsync(cancellationToken);
        return (Outcome.Success(), new AdminUpload(replaced, previous, superseded));
    }

    /// <summary>
    /// Withdraws the pending replacement for one slot, keeping the other half
    /// of the held change. Returns the attachment withdrawn, if any.
    /// </summary>
    private static string? DropPending(AthleteMedicalFile file, string slot)
    {
        if (file.PendingChangeJson is null) return null;
        if (slot is not (MedicalDocumentSlots.Certificate or MedicalDocumentSlots.Screening)) return null;

        PendingChange? pending;
        try
        {
            pending = JsonSerializer.Deserialize<PendingChange>(file.PendingChangeJson, Json);
        }
        catch (JsonException)
        {
            return null;
        }
        if (pending is null) return null;

        string? dropped;
        if (slot == MedicalDocumentSlots.Certificate)
        {
            dropped = pending.CertificateAttachmentId;
            pending = pending with { CertificateAttachmentId = null, CertificateDate = null };
        }
        else
        {
            dropped = pending.ScreeningAttachmentId;
            pending = pending with { ScreeningAttachmentId = null, ScreeningDate = null };
        }
        if (dropped is null) return null;

        if (pending.CertificateAttachmentId is null && pending.ScreeningAttachmentId is null)
        {
            file.PendingChangeJson = null;
            file.PendingChangeAt = null;
        }
        else
        {
            file.PendingChangeJson = JsonSerializer.Serialize(pending, Json);
        }
        return dropped;
    }

    /// <summary>The pending replacement for a slot, if the athlete has one waiting.</summary>
    public static string? PendingFor(AthleteMedicalFile file, string slot)
    {
        if (file.PendingChangeJson is null) return null;
        try
        {
            var pending = JsonSerializer.Deserialize<PendingChange>(file.PendingChangeJson, Json);
            return slot switch
            {
                MedicalDocumentSlots.Certificate => pending?.CertificateAttachmentId,
                MedicalDocumentSlots.Screening => pending?.ScreeningAttachmentId,
                _ => null,
            };
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>The file as a screen needs it, with what is still missing spelled out.</summary>
    public object Describe(AthleteMedicalFile file, int? age, string? gender, IReadOnlyList<ApprovalLock>? locks = null)
    {
        var answers = Read<Dictionary<string, bool>>(file.HealthAnswersJson) ?? [];
        var declarations = Read<Dictionary<string, bool>>(file.DeclarationsJson) ?? [];
        var missing = file.Missing(age, gender);

        return new
        {
            medicalLock = LockView(locks),
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
            // Girls under 18: the non-pregnancy declaration is its own signed document.
            pregnancyDocumentApplies = age is not null && age < 18 && gender == "female",
            file.NotPregnantDeclared,
            file.GuardianConsentAttachmentId,
            file.PregnancyDeclarationAttachmentId,
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

    /// <summary>One tournament the athlete is entered in, and their competition age for its year.</summary>
    public sealed record EntryContext(int TournamentId, string NameAr, string NameEn, DateTime StartDate, int? Age);

    /// <summary>One document a tournament needs: approved, on file ("uploaded") or "missing".</summary>
    public sealed record RequiredDocument(
        string Key, string Ar, string En, string Status, DateTime? Date, bool ReplacementPending);

    /// <summary>
    /// The athlete's Medical File as their tournaments make it: what each
    /// tournament they are entered in still needs from them.
    ///
    /// The file is one per athlete, so a certificate uploaded once serves every
    /// tournament; what differs per tournament is which documents apply, since
    /// that follows the athlete's competition age in its year. Documents are
    /// always listed, uploaded or not. Questions and declarations are listed
    /// only while outstanding: an answer given once is not asked again.
    /// "Uploaded" is not approved; "approved" means an authorised user approved
    /// the document now in use.
    /// </summary>
    public object Requirements(
        AthleteMedicalFile file, IReadOnlyList<EntryContext> entries, string? gender,
        IReadOnlyList<ApprovalLock>? locks = null)
    {
        var pending = file.PendingChangeJson is null
            ? null
            : JsonSerializer.Deserialize<PendingChange>(file.PendingChangeJson, Json);

        var approvals = file.Approvals();

        // "approved" when an authorised user approved the document in use —
        // their own upload, or an athlete's replacement they accepted.
        RequiredDocument Document(
            string key, string ar, string en, string? attachmentId, DateTime? date, bool replacementPending) =>
            new(key, ar, en,
                string.IsNullOrWhiteSpace(attachmentId) ? "missing"
                : approvals.ContainsKey(key) ? "approved"
                : "uploaded",
                string.IsNullOrWhiteSpace(attachmentId) ? null : date, replacementPending);

        var groups = entries.Select(entry =>
        {
            var documents = new List<RequiredDocument>
            {
                Document("certificate", "الشهادة الطبية", "Medical certificate",
                    file.CertificateAttachmentId, file.CertificateDate, pending?.CertificateAttachmentId is not null),
            };
            if (entry.Age is > 15)
            {
                documents.Add(Document("screening", "تحليل HIV / HBV / HCV", "HIV / HBV / HCV test",
                    file.ScreeningAttachmentId, file.ScreeningDate, pending?.ScreeningAttachmentId is not null));
            }
            if (entry.Age is not null and < 18)
            {
                documents.Add(Document("guardian_consent", "موافقة ولي الأمر", "Guardian consent",
                    file.GuardianConsentAttachmentId, null, false));
                // Girls under 18: a second, separate signed document.
                if (gender == "female")
                {
                    documents.Add(Document("pregnancy_declaration", "إقرار عدم الحمل", "Non-pregnancy declaration",
                        file.PregnancyDeclarationAttachmentId, null, false));
                }
            }

            return new
            {
                tournamentId = entry.TournamentId,
                tournamentNameAr = entry.NameAr,
                tournamentNameEn = entry.NameEn,
                entry.StartDate,
                competitionAge = entry.Age,
                documents,
                missingDocuments = documents.Count(d => d.Status == "missing"),
            };
        }).ToList();

        var adult = entries.Any(e => e.Age is >= 18);
        var unanswered = entries.Count == 0 ? [] : file.Unanswered();
        var undeclared = adult ? file.Undeclared() : [];
        var pregnancyApplies = adult && gender == "female";

        return new
        {
            tournaments = groups,
            // Only what is still open; answered questions do not come back.
            questions = unanswered.Select(q => new { q.Key, q.Ar, q.En, q.AsksForDetail }),
            declarations = undeclared.Select(d => new { d.Key, d.Ar, d.En }),
            pregnancyDeclarationOutstanding = pregnancyApplies && file.NotPregnantDeclared is not true,
            guardianConsentApplies = entries.Any(e => e.Age is not null and < 18),
            hasPendingChange = file.PendingChangeJson is not null,
            medicalLock = LockView(locks),
        };
    }

    /* ── the lock that Final Approval puts on the Medical File ──────────────
       The file is the athlete's, shared by every tournament they enter. Once
       they hold Final Approval in an active tournament (published, closed or
       running), the approved record must not change underneath the decision:
       the athlete can only read it, the technical team can no longer change
       it, and only the final-approval authority (tournament.director) may —
       through the admin routes, and not once a draw is published. */

    /// <summary>One active Final Approval that holds the file.</summary>
    public sealed record ApprovalLock(int EntryId, int TournamentId, string? TournamentNameAr, string? TournamentNameEn,
        bool DrawPublished);

    public Task<List<ApprovalLock>> ApprovalLocksAsync(int athleteRegistrationId, CancellationToken cancellationToken = default) =>
        db.TournamentEntries.AsNoTracking()
            .Where(e => e.AthleteRegistrationId == athleteRegistrationId
                        && e.Status == EntryStatuses.Qualified && e.QualifiedAt != null
                        && (e.Tournament!.Status == TournamentStatuses.Published
                            || e.Tournament.Status == TournamentStatuses.Closed
                            || e.Tournament.Status == TournamentStatuses.Running))
            .Select(e => new ApprovalLock(e.Id, e.TournamentId, e.Tournament!.NameAr, e.Tournament.NameEn,
                e.Division != null && e.Division.DrawPublishedAt != null))
            .ToListAsync(cancellationToken);

    /// <summary>Of these athletes, those whose file an active Final Approval holds — for list screens.</summary>
    public async Task<HashSet<int>> LockedAthletesAsync(IReadOnlyCollection<int> athleteIds, CancellationToken cancellationToken = default) =>
        (await db.TournamentEntries.AsNoTracking()
            .Where(e => athleteIds.Contains(e.AthleteRegistrationId)
                        && e.Status == EntryStatuses.Qualified && e.QualifiedAt != null
                        && (e.Tournament!.Status == TournamentStatuses.Published
                            || e.Tournament.Status == TournamentStatuses.Closed
                            || e.Tournament.Status == TournamentStatuses.Running))
            .Select(e => e.AthleteRegistrationId)
            .Distinct()
            .ToListAsync(cancellationToken)).ToHashSet();

    /// <summary>The athlete's own account: refused while any Final Approval holds the file.</summary>
    public async Task<Outcome?> MemberLockedAsync(int athleteRegistrationId, CancellationToken cancellationToken = default)
    {
        var locks = await ApprovalLocksAsync(athleteRegistrationId, cancellationToken);
        if (locks.Count == 0) return null;
        var ar = string.Join("، ", locks.Select(l => l.TournamentNameAr ?? l.TournamentNameEn).Distinct());
        var en = string.Join(", ", locks.Select(l => l.TournamentNameEn ?? l.TournamentNameAr).Distinct());
        return Outcome.Conflict(
            $"ملفك الطبي مقفل لحصولك على الاعتماد النهائي في: {ar}. يمكنك الاطلاع عليه فقط؛ للتعديل تواصل مع الاتحاد.",
            $"Your Medical File is locked because you have Final Approval in: {en}. You can view it; "
            + "to change it, contact the federation.");
    }

    /// <summary>What an admin route decides before changing the file.</summary>
    public sealed record AdminAccess(int Status, string? Message, bool AfterFinalApproval)
    {
        public bool Ok => Status == 200;
    }

    /// <summary>
    /// Whether this administrator may change the athlete's file now. Before
    /// any Final Approval the route's own permission decides (<paramref name="mayBefore"/>);
    /// after it only tournament.director; a published draw — for this entry's
    /// division or any approval holding the file — closes it to everyone. When the
    /// entry is given, its division's published draw closes the file only if the entry
    /// is in that bracket: a late entrant (joined after publication) is examined normally.
    /// </summary>
    public async Task<AdminAccess> AdminMayChangeAsync(
        int athleteRegistrationId, int? entryDivisionId, AdminIdentity.Actor actor, bool mayBefore,
        CancellationToken cancellationToken = default, TournamentEntry? entry = null)
    {
        var locks = await ApprovalLocksAsync(athleteRegistrationId, cancellationToken);
        var entryPublished = entry is not null
            ? await TournamentEntryService.InPublishedDrawAsync(db, entry, cancellationToken)
            : entryDivisionId is { } id
              && await db.TournamentDivisions.AnyAsync(d => d.Id == id && d.DrawPublishedAt != null, cancellationToken);

        if (entryPublished || locks.Any(l => l.DrawPublished))
            return new(409, "The athlete's draw is published; the medical file can no longer be changed here.", false);

        if (locks.Count > 0)
        {
            return actor.Has(AdminPermissions.TournamentDirector)
                ? new(200, null, true)
                : new(403, "The athlete has Final Approval; only the final-approval authority (tournament.director) "
                           + "may change their medical file now.", false);
        }

        return mayBefore
            ? new(200, null, false)
            : new(403, "Changing the medical file needs the technical team permission (tournament.technical).", false);
    }

    private static object? LockView(IReadOnlyList<ApprovalLock>? locks) => locks is { Count: > 0 }
        ? new
        {
            locked = true,
            tournaments = locks.Select(l => new { l.TournamentId, nameAr = l.TournamentNameAr, nameEn = l.TournamentNameEn })
                .DistinctBy(l => l.TournamentId),
        }
        : null;

    private static void Apply(
        AthleteMedicalFile file,
        string? certificateId, DateTime? certificateDate,
        string? screeningId, DateTime? screeningDate)
    {
        // A document's date travels with the document. A date sent without a
        // file used to be stored on its own, which put a date beside a
        // document that was never uploaded.
        if (certificateId is not null)
        {
            if (certificateDate is not null || certificateId != file.CertificateAttachmentId)
                file.CertificateDate = certificateDate;
            file.CertificateAttachmentId = certificateId;
        }
        if (screeningId is not null)
        {
            if (screeningDate is not null || screeningId != file.ScreeningAttachmentId)
                file.ScreeningDate = screeningDate;
            file.ScreeningAttachmentId = screeningId;
        }
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
