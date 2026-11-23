using System.Text.Json;

namespace Smf.Api.Data.Models;

/// <summary>
/// An athlete's medical file — Phase 3 REQ-04.
///
/// Collected while entering a tournament, but held against the athlete rather
/// than the entry: a certificate is valid for a period, not for one event, and
/// the next tournament should find it already there.
///
/// REQ-04 rule 6 is the governing idea, and it is worth stating plainly because
/// it reads backwards at first: <b>none of this blocks an entry</b>. An athlete
/// may enter with nothing uploaded. What it blocks is competing — the
/// examination desk is where a missing certificate stops someone, not the
/// registration form.
/// </summary>
public class AthleteMedicalFile
{
    public int Id { get; set; }

    /// <summary>The athlete's membership record.</summary>
    public int AthleteRegistrationId { get; set; }
    public Registration? AthleteRegistration { get; set; }

    /* ── 1. documents (REQ-04 rule 1) ───────────────────────────────────── */

    /// <summary>Attachment id of the medical certificate.</summary>
    public string? CertificateAttachmentId { get; set; }
    public DateTime? CertificateDate { get; set; }

    /// <summary>
    /// HIV / HBV / HCV screening, required only of athletes over 15
    /// (REQ-04 rule 1).
    /// </summary>
    public string? ScreeningAttachmentId { get; set; }
    public DateTime? ScreeningDate { get; set; }

    /* ── 2. health questions (REQ-04 rule 2) ────────────────────────────── */

    /// <summary>
    /// The eight yes/no answers, stored as JSON keyed by the question id so a
    /// question added later does not need a column. Null until answered.
    /// </summary>
    public string? HealthAnswersJson { get; set; }

    /// <summary>Named when the answer to "are you taking any medication" is yes.</summary>
    public string? Medications { get; set; }

    /* ── 3. declarations and consents (REQ-04 rule 3) ───────────────────── */

    /// <summary>The four declarations an adult ticks, as JSON of id → accepted.</summary>
    public string? DeclarationsJson { get; set; }

    /// <summary>Women of 18 and over declare they are not pregnant, by tick box.</summary>
    public bool? NotPregnantDeclared { get; set; }

    /// <summary>
    /// Under-18s cannot tick anything: a guardian downloads the consent,
    /// signs it and it is uploaded.
    /// </summary>
    public string? GuardianConsentAttachmentId { get; set; }

    /// <summary>
    /// Girls under 18: the non-pregnancy declaration, as its own signed
    /// document beside the guardian consent — a separate form, upload and
    /// status. (Before the two were separated, the guardian consent form
    /// carried this clause; such an upload still counts as the guardian
    /// consent and is not taken as this declaration.)
    /// </summary>
    public string? PregnancyDeclarationAttachmentId { get; set; }

    /* ── provenance ─────────────────────────────────────────────────────── */

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// REQ-04 rule 5 and REQ-05/06/07's closing rule: once an athlete changes
    /// their certificate or screening, the change waits for an authorised
    /// user's approval before it counts. Null when there is nothing pending.
    /// </summary>
    public string? PendingChangeJson { get; set; }
    public DateTime? PendingChangeAt { get; set; }

    public DateTime? ApprovedAt { get; set; }
    public string? ApprovedBy { get; set; }

    /// <summary>
    /// Which of the documents now in use an authorised user has approved, by
    /// slot (<see cref="MedicalDocumentSlots"/>): who and when. A document
    /// uploaded by an administrator is approved as it is stored; an athlete's
    /// replacement becomes approved when its pending change is. An athlete's
    /// own first upload is in use but carries no approval, so its slot is
    /// absent. Null when nothing has been approved.
    /// </summary>
    public string? DocumentApprovalsJson { get; set; }

    public sealed record DocumentApproval(DateTime At, string By);

    public Dictionary<string, DocumentApproval> Approvals()
    {
        if (string.IsNullOrWhiteSpace(DocumentApprovalsJson)) return [];
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, DocumentApproval>>(DocumentApprovalsJson, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public void SetApproval(string slot, string by, DateTime at)
    {
        var approvals = Approvals();
        approvals[slot] = new DocumentApproval(at, by);
        DocumentApprovalsJson = JsonSerializer.Serialize(approvals, Json);
    }

    public void ClearApproval(string slot)
    {
        var approvals = Approvals();
        if (!approvals.Remove(slot)) return;
        DocumentApprovalsJson = approvals.Count == 0 ? null : JsonSerializer.Serialize(approvals, Json);
    }

    /// <summary>The attachment now in use in a document slot.</summary>
    public string? AttachmentIn(string slot) => slot switch
    {
        MedicalDocumentSlots.Certificate => CertificateAttachmentId,
        MedicalDocumentSlots.Screening => ScreeningAttachmentId,
        MedicalDocumentSlots.GuardianConsent => GuardianConsentAttachmentId,
        MedicalDocumentSlots.PregnancyDeclaration => PregnancyDeclarationAttachmentId,
        _ => null,
    };

    /// <summary>The documents REQ-04 asks of an athlete of this competition age and gender.</summary>
    public static IReadOnlyList<string> DocumentsFor(int? age, string? gender)
    {
        var slots = new List<string> { MedicalDocumentSlots.Certificate };
        if (age is > 15) slots.Add(MedicalDocumentSlots.Screening);
        if (age is not null and < 18)
        {
            slots.Add(MedicalDocumentSlots.GuardianConsent);
            if (gender == "female") slots.Add(MedicalDocumentSlots.PregnancyDeclaration);
        }
        return slots;
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    /// <summary>The health answers given so far, question by question.</summary>
    public Dictionary<string, bool> Answers() => ReadFlags(HealthAnswersJson);

    /// <summary>The declarations accepted so far.</summary>
    public Dictionary<string, bool> Declared() => ReadFlags(DeclarationsJson);

    /// <summary>The questions not yet answered, in the document's order.</summary>
    public IReadOnlyList<HealthQuestions.Question> Unanswered()
    {
        var answers = Answers();
        return HealthQuestions.All.Where(q => !answers.ContainsKey(q.Key)).ToList();
    }

    /// <summary>The declarations not yet accepted, in the document's order.</summary>
    public IReadOnlyList<AthleteDeclarations.Declaration> Undeclared()
    {
        var declared = Declared();
        return AthleteDeclarations.All.Where(d => !(declared.TryGetValue(d.Key, out var yes) && yes)).ToList();
    }

    private static Dictionary<string, bool> ReadFlags(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, bool>>(json, Json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>True when a certificate is on file at all.</summary>
    public bool HasCertificate => !string.IsNullOrWhiteSpace(CertificateAttachmentId);

    /// <summary>
    /// Whether the screening requirement is met for an athlete of this age.
    /// Under 16 it does not apply, so it counts as met.
    /// </summary>
    public bool ScreeningSatisfied(int? age) =>
        age is null or <= 15 || !string.IsNullOrWhiteSpace(ScreeningAttachmentId);

    /// <summary>
    /// Everything REQ-04 asks of an athlete of this age and gender, as a list
    /// of what is still missing. Empty means the file is complete.
    ///
    /// This is what the examination desk reads (REQ-08 rule 2) — it does not
    /// stop anybody entering.
    /// </summary>
    public IReadOnlyList<(string Ar, string En)> Missing(int? age, string? gender)
    {
        var gaps = new List<(string, string)>();

        if (!HasCertificate) gaps.Add(("الشهادة الطبية", "Medical certificate"));
        if (!ScreeningSatisfied(age)) gaps.Add(("تحليل HIV / HBV / HCV", "HIV / HBV / HCV screening"));
        // Every question answered and every declaration accepted: one left
        // blank is still missing.
        if (Unanswered().Count > 0) gaps.Add(("الأسئلة الصحية", "Health questions"));

        if (age is >= 18)
        {
            if (Undeclared().Count > 0)
                gaps.Add(("الإقرارات والموافقات", "Declarations and consents"));

            if (gender == "female" && NotPregnantDeclared is not true)
                gaps.Add(("إقرار عدم الحمل", "Pregnancy declaration"));
        }
        else if (age is not null)
        {
            if (string.IsNullOrWhiteSpace(GuardianConsentAttachmentId))
                gaps.Add(("موافقة ولي الأمر الموقعة", "Signed guardian consent"));

            if (gender == "female" && string.IsNullOrWhiteSpace(PregnancyDeclarationAttachmentId))
                gaps.Add(("إقرار عدم الحمل الموقّع", "Signed non-pregnancy declaration"));
        }

        return gaps;
    }
}

/// <summary>The four document slots of a Medical File, as the API names them.</summary>
public static class MedicalDocumentSlots
{
    public const string Certificate = "certificate";
    public const string Screening = "screening";
    public const string GuardianConsent = "guardian_consent";
    public const string PregnancyDeclaration = "pregnancy_declaration";

    /// <summary>The two that carry a date — when the examination or test was done.</summary>
    public static bool IsDated(string slot) => slot is Certificate or Screening;
}

/// <summary>
/// The eight health questions of REQ-04 rule 2, in the document's own order.
///
/// Held in code rather than content because the examination desk reads the
/// answers back by key: renaming one in a content editor would orphan every
/// answer already stored.
/// </summary>
public static class HealthQuestions
{
    public record Question(string Key, string Ar, string En, bool AsksForDetail = false);

    public static readonly IReadOnlyList<Question> All =
    [
        new("ko_6_months",
            "هل سبق أن خضعت نزالًا انتهى بـ KO أو RSC-H خلال آخر 6 أشهر؟",
            "Have you had a bout stopped by KO or RSC-H in the last 6 months?"),
        new("wada_positive",
            "هل سبق أن كانت نتيجة فحصك إيجابية وفق فحوصات WADA؟",
            "Have you ever returned a positive result under WADA testing?"),
        new("medication_now",
            "هل تتناول حاليًا أي أدوية؟",
            "Are you currently taking any medication?",
            AsksForDetail: true),
        new("surgery_6_months",
            "هل أجريت أي عملية جراحية خلال آخر 6 أشهر؟",
            "Have you had any surgery in the last 6 months?"),
        new("hospital_6_months",
            "هل احتجت إلى علاج أو إقامة داخل المستشفى خلال آخر 6 أشهر؟",
            "Have you needed treatment or a hospital stay in the last 6 months?"),
        new("fracture_6_months",
            "هل تلقيت علاجًا لكسر أو شرخ أو خلع عظمي خلال آخر 6 أشهر؟",
            "Have you been treated for a fracture or dislocation in the last 6 months?"),
        new("glasses_or_lenses",
            "هل ترتدي عادةً نظارات طبية أو عدسات لاصقة؟",
            "Do you normally wear glasses or contact lenses?"),
        new("spine_surgery",
            "هل سبق أن أجريت عملية جراحية في الظهر أو العمود الفقري؟",
            "Have you ever had surgery on your back or spine?"),
    ];

    /// <summary>The question whose "yes" opens a box for the medicine's name.</summary>
    public const string MedicationKey = "medication_now";
}

/// <summary>The four declarations an adult accepts — REQ-04 rule 3.</summary>
public static class AthleteDeclarations
{
    public record Declaration(string Key, string Ar, string En);

    public static readonly IReadOnlyList<Declaration> All =
    [
        new("participation",
            "إقرار المشاركة: الإقرار بمخاطر الرياضة والالتزام بالقواعد وتعليمات المنظمين وإخلاء مسؤولية الاتحاد.",
            "Participation: acknowledging the risks of the sport, agreeing to the rules and the organisers' instructions, and releasing the federation from liability."),
        new("media",
            "الموافقة الإعلامية: الموافقة على الصور والفيديو والبث المباشر واستخدامها من قبل الاتحاد.",
            "Media: consent to photography, video and live broadcast, and to the federation's use of them."),
        new("anti_doping",
            "مكافحة المنشطات: الالتزام بقواعد مكافحة المنشطات والموافقة على استخدام البيانات لهذا الغرض.",
            "Anti-doping: agreeing to the anti-doping rules and to the use of data for that purpose."),
        new("data_accuracy",
            "صحة البيانات: الإقرار بأن المعلومات المقدمة صحيحة.",
            "Accuracy: declaring that the information given is correct."),
    ];
}
