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
    /// The nine yes/no answers, stored as JSON keyed by the question id so a
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
    /// signs it and it is uploaded. For girls under 18 the same document
    /// carries the pregnancy declaration.
    /// </summary>
    public string? GuardianConsentAttachmentId { get; set; }

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
        if (string.IsNullOrWhiteSpace(HealthAnswersJson)) gaps.Add(("الأسئلة الصحية", "Health questions"));

        if (age is >= 18)
        {
            if (string.IsNullOrWhiteSpace(DeclarationsJson))
                gaps.Add(("الإقرارات والموافقات", "Declarations and consents"));

            if (gender == "female" && NotPregnantDeclared is not true)
                gaps.Add(("إقرار عدم الحمل", "Pregnancy declaration"));
        }
        else if (age is not null)
        {
            if (string.IsNullOrWhiteSpace(GuardianConsentAttachmentId))
                gaps.Add(("موافقة ولي الأمر الموقعة", "Signed guardian consent"));
        }

        return gaps;
    }
}

/// <summary>
/// The nine health questions of REQ-04 rule 2, in the document's own order.
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
