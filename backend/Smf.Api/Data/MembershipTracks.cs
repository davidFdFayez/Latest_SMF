namespace Smf.Api.Data;

/// <summary>
/// The four membership tracks and their approval chains, transcribed from the
/// federation's Phase 2 workflow document
/// (<c>SMF_Phase2_Membership_Workflows_Requirements_AR.docx</c>, §2–§5).
///
/// Each track carries the licence name, term, and fees the federation stated,
/// plus the ordered stages a request passes through. The stage list is data,
/// not control flow: §1 says stages may be added or removed to match the
/// procedure actually in force, so the admin UI renders whatever is here.
/// </summary>
public static class MembershipTracks
{
    /// <summary>One step in a track's approval chain (§N.ب).</summary>
    /// <param name="Order">1-based position, as numbered in the document.</param>
    /// <param name="NameAr">اسم المرحلة.</param>
    /// <param name="OwnerAr">المسؤول / الجهة — who performs this step.</param>
    /// <param name="ActionAr">الإجراء المطلوب.</param>
    /// <param name="OutcomeAr">الحالة الناتجة.</param>
    /// <param name="Status">
    /// The <see cref="RegistrationStatuses"/> value a request sits at while this
    /// stage is the current one.
    /// </param>
    public record Stage(
        int Order,
        string NameAr,
        string NameEn,
        string OwnerAr,
        string OwnerEn,
        string ActionAr,
        string ActionEn,
        string OutcomeAr,
        string OutcomeEn,
        string Status);

    /// <param name="Key">Matches <see cref="Models.Registration.Type"/>.</param>
    /// <param name="TermYears">مدة العضوية — three years for every track (§1 note).</param>
    /// <param name="RegistrationFeeAr">رسوم التسجيل, verbatim from the federation.</param>
    /// <param name="RenewalFeeAr">رسوم التجديد, verbatim from the federation.</param>
    /// <param name="PrerequisitesAr">متطلبات خاصة قبل القبول.</param>
    public record Track(
        string Key,
        string LicenceNameAr,
        string LicenceNameEn,
        int TermYears,
        string RegistrationFeeAr,
        string RegistrationFeeEn,
        string RenewalFeeAr,
        string RenewalFeeEn,
        string PrerequisitesAr,
        string PrerequisitesEn,
        IReadOnlyList<Stage> Stages);

    /// <summary>مدة العضوية في منصة رياضي ثلاث سنوات (§1 — ملاحظة من الاتحاد).</summary>
    public const int DefaultTermYears = 3;

    /// <summary>
    /// مهلة استكمال الطلب الناقص — 7 working days. The document marks it
    /// "قابلة للتعديل", so it is a default the federation can override rather
    /// than a constant the code depends on.
    /// </summary>
    public const int DefaultCompletionWorkingDays = 7;

    /// <summary>
    /// المرحلة 5 — identical wording across all four tracks; only the resulting
    /// membership name differs, which each track supplies with a `with` clause.
    /// </summary>
    private static readonly Stage FinalApproval = new(
        5,
        "الاعتماد النهائي", "Final approval",
        "المخول عبر لوحة تحكم الاتحاد", "Authorised approver via the federation dashboard",
        "مراجعة الطلب من الداشبورد وقبول التسجيل أو تحديث الحالة عند اكتمال المتطلبات",
        "Review the request from the dashboard and accept the registration, or update its status once the requirements are met.",
        "عضوية فعالة", "Active membership",
        RegistrationStatuses.AwaitingApproval);

    public static readonly IReadOnlyList<Track> All =
    [
        // §2 — مسار عضوية اللاعب
        new("athlete",
            "عضوية لاعب مسجل في الاتحاد السعودي للملاكمة التايلندية",
            "Registered athlete membership — Saudi Muaythai Federation",
            DefaultTermYears,
            "لا يوجد رسوم لتسجيل اللاعبين في المنصة",
            "No fee for athlete registration on the platform.",
            "لا يوجد رسوم لتجديد عضوية اللاعب",
            "No fee to renew an athlete membership.",
            "بيانات الهوية والتواصل والبريد الإلكتروني، النادي/المدرب إن وجد، موافقة ولي الأمر للقاصر. الفحص الطبي والتعهد يؤخذان عند البطولات وليس كشرط تسجيل دائم.",
            "Identity and contact details including email; club/coach if any; guardian consent for minors. The medical check and undertaking are collected at tournaments, not as a standing registration condition.",
            [
                new(1, "تقديم الطلب", "Submission",
                    "اللاعب / ولي الأمر / النادي", "Athlete / guardian / club",
                    "إدخال بيانات التسجيل ورفع المرفقات المطلوبة",
                    "Enter the registration details and upload the required attachments.",
                    "طلب جديد", "New request",
                    RegistrationStatuses.New),
                new(2, "مراجعة أولية", "Initial review",
                    "مراجع العضويات", "Membership reviewer",
                    "التحقق من اكتمال البيانات والهوية والبريد ورقم الجوال وعدم وجود نواقص",
                    "Verify that the details, identity, email, and mobile number are complete and nothing is missing.",
                    "مكتمل أو يحتاج استكمال", "Complete, or completion required",
                    RegistrationStatuses.UnderReview),
                new(3, "طلب استكمال", "Completion request",
                    "مراجع العضويات", "Membership reviewer",
                    "إعادة الطلب للمتقدم عند وجود نقص أو خطأ في البيانات",
                    "Return the request to the applicant when data is missing or incorrect.",
                    "بانتظار استكمال", "Awaiting completion",
                    RegistrationStatuses.AwaitingCompletion),
                new(4, "مراجعة فنية/تشغيلية", "Technical / operational review",
                    "الإدارة الفنية أو مسؤول التسجيل", "Technical department or registration officer",
                    "مراجعة فئة اللاعب والنادي/المدرب المرتبط والتأكد من عدم التعارض أو التكرار",
                    "Review the athlete's category and linked club/coach, and confirm there is no conflict or duplicate.",
                    "موصى بالاعتماد", "Recommended for approval",
                    RegistrationStatuses.UnderReview),
                FinalApproval with { OutcomeAr = "عضوية لاعب فعالة", OutcomeEn = "Active athlete membership" },
            ]),

        // §3 — مسار عضوية المدرب
        new("coach",
            "عضوية / رخصة مدرب ملاكمة تايلندية",
            "Muaythai coach membership / licence",
            DefaultTermYears,
            "لا يوجد رسوم لتسجيل المدرب في المنصة، ورسوم إصدار بطاقة/عضوية المدرب - إن وجدت - يتم تأكيدها من الأستاذ حمد",
            "No fee to register a coach on the platform. Any coach card/membership issuance fee is to be confirmed by Mr. Hamad.",
            "رسوم تجديد بطاقة/عضوية المدرب - إن وجدت - يتم تأكيدها من الأستاذ حمد",
            "Any coach card/membership renewal fee is to be confirmed by Mr. Hamad.",
            "بيانات الهوية والتواصل والبريد الإلكتروني، النادي أو المركز المرتبط، شهادات التدريب أو الدورات إن وجدت، والخبرة التدريبية.",
            "Identity and contact details including email; the linked club or centre; coaching certificates or courses if any; and coaching experience.",
            [
                new(1, "تقديم الطلب", "Submission",
                    "المدرب / النادي", "Coach / club",
                    "إدخال البيانات الأساسية ورفع شهادات التدريب والخبرة إن وجدت",
                    "Enter the core details and upload coaching certificates and experience, if any.",
                    "طلب جديد", "New request",
                    RegistrationStatuses.New),
                new(2, "مراجعة البيانات", "Data review",
                    "مراجع العضويات", "Membership reviewer",
                    "التحقق من اكتمال الهوية والتواصل والمرفقات",
                    "Verify that identity, contact details, and attachments are complete.",
                    "مكتمل أو يحتاج استكمال", "Complete, or completion required",
                    RegistrationStatuses.UnderReview),
                new(3, "مراجعة المؤهلات", "Qualifications review",
                    "الإدارة الفنية", "Technical department",
                    "مراجعة الشهادات والخبرة والارتباط بالنادي أو المركز",
                    "Review certificates, experience, and the link to the club or centre.",
                    "مؤهل مبدئياً أو يحتاج استكمال", "Provisionally qualified, or completion required",
                    RegistrationStatuses.UnderReview),
                new(4, "طلب استكمال", "Completion request",
                    "مراجع العضويات / الإدارة الفنية", "Membership reviewer / technical department",
                    "طلب توضيح أو مرفقات إضافية عند الحاجة",
                    "Request clarification or additional attachments where needed.",
                    "بانتظار استكمال", "Awaiting completion",
                    RegistrationStatuses.AwaitingCompletion),
                FinalApproval with { OutcomeAr = "عضوية مدرب فعالة", OutcomeEn = "Active coach membership" },
            ]),

        // §4 — مسار عضوية الحكم. Stored as "official"; the public portal says "referee".
        new("official",
            "عضوية / رخصة حكم ملاكمة تايلندية",
            "Muaythai referee membership / licence",
            DefaultTermYears,
            "لا يوجد رسوم لتسجيل الحكم في المنصة، ورسوم إصدار بطاقة/عضوية الحكم - إن وجدت - يتم تأكيدها من الأستاذ حمد",
            "No fee to register a referee on the platform. Any referee card/membership issuance fee is to be confirmed by Mr. Hamad.",
            "رسوم تجديد بطاقة/عضوية الحكم - إن وجدت - يتم تأكيدها من الأستاذ حمد",
            "Any referee card/membership renewal fee is to be confirmed by Mr. Hamad.",
            "بيانات الهوية والتواصل والبريد الإلكتروني، تاريخ بداية التحكيم، الدورات أو الشهادات إن وجدت، وتصنيف الحكم ويكون قابلاً للتعديل من الاتحاد.",
            "Identity and contact details including email; the date refereeing began; courses or certificates if any; and the referee grade, which the federation can amend.",
            [
                new(1, "تقديم الطلب", "Submission",
                    "الحكم", "Referee",
                    "إدخال البيانات ورفع الشهادات أو الدورات إن وجدت",
                    "Enter the details and upload certificates or courses, if any.",
                    "طلب جديد", "New request",
                    RegistrationStatuses.New),
                new(2, "مراجعة أولية", "Initial review",
                    "مراجع العضويات", "Membership reviewer",
                    "التحقق من اكتمال البيانات والمرفقات",
                    "Verify that the details and attachments are complete.",
                    "مكتمل أو يحتاج استكمال", "Complete, or completion required",
                    RegistrationStatuses.UnderReview),
                new(3, "مراجعة لجنة الحكام", "Referees committee review",
                    "مسؤول الحكام / الجهة الفنية", "Referees officer / technical body",
                    "مراجعة الخبرة وتصنيف الحكم وتحديد المستوى المناسب عند الحاجة",
                    "Review experience and referee grade, and set the appropriate level where needed.",
                    "موصى بالاعتماد أو التصنيف", "Recommended for approval or grading",
                    RegistrationStatuses.UnderReview),
                new(4, "طلب استكمال", "Completion request",
                    "مراجع العضويات / مسؤول الحكام", "Membership reviewer / referees officer",
                    "طلب نواقص أو توضيحات عند الحاجة",
                    "Request missing items or clarifications where needed.",
                    "بانتظار استكمال", "Awaiting completion",
                    RegistrationStatuses.AwaitingCompletion),
                FinalApproval with { OutcomeAr = "عضوية حكم فعالة", OutcomeEn = "Active referee membership" },
            ]),

        // §5 — مسار عضوية النادي / المنشأة
        new("club",
            "عضوية نادي / منشأة تدريب ملاكمة تايلندية",
            "Muaythai club / training facility membership",
            DefaultTermYears,
            "لا يوجد رسوم محددة حالياً في مسار التسجيل، وأي رسوم اعتماد/بطاقة - إن وجدت - يتم تأكيدها من الجهة المختصة",
            "No fee is currently set for the registration path. Any accreditation/card fee is to be confirmed by the competent body.",
            "بحاجة تأكيد عند اعتماد آلية تجديد عضوية النادي/المنشأة",
            "To be confirmed once the club/facility renewal mechanism is approved.",
            "بيانات المالك أو المفوض، البريد الإلكتروني، رقم الجوال، بيانات المدرب الأساسي، موقع النادي على Google Maps، الفروع، والسجلات/التراخيص النظامية المتاحة.",
            "Owner or authorised representative details, email, mobile number, head coach details, the club's Google Maps location, branches, and available statutory records/licences.",
            [
                new(1, "تقديم الطلب", "Submission",
                    "مالك النادي / المفوض / المدرب المسؤول", "Club owner / authorised representative / responsible coach",
                    "إدخال بيانات المنشأة ورفع التراخيص والموقع وبيانات المدرب الأساسي",
                    "Enter the facility details and upload licences, location, and head coach details.",
                    "طلب جديد", "New request",
                    RegistrationStatuses.New),
                new(2, "مراجعة إدارية", "Administrative review",
                    "مراجع العضويات", "Membership reviewer",
                    "التحقق من اكتمال بيانات المالك والمنشأة والمرفقات",
                    "Verify that the owner and facility details and the attachments are complete.",
                    "مكتمل أو يحتاج استكمال", "Complete, or completion required",
                    RegistrationStatuses.UnderReview),
                new(3, "مراجعة فنية", "Technical review",
                    "الإدارة الفنية", "Technical department",
                    "مراجعة مناسبة المنشأة والمدرب الأساسي والفروع والأنشطة المرتبطة بالملاكمة التايلندية",
                    "Review the suitability of the facility, head coach, branches, and Muaythai-related activities.",
                    "موصى بالاعتماد", "Recommended for approval",
                    RegistrationStatuses.UnderReview),
                new(4, "طلب استكمال", "Completion request",
                    "مراجع العضويات / الإدارة الفنية", "Membership reviewer / technical department",
                    "طلب نواقص أو تحديث مرفقات أو معلومات عند الحاجة",
                    "Request missing items, or updated attachments or information, where needed.",
                    "بانتظار استكمال", "Awaiting completion",
                    RegistrationStatuses.AwaitingCompletion),
                FinalApproval with { OutcomeAr = "عضوية منشأة فعالة", OutcomeEn = "Active facility membership" },
            ]),
    ];

    public static Track? Get(string? type) =>
        type is null ? null : All.FirstOrDefault(t => t.Key == type);

    public static bool IsValid(string? type) => Get(type) is not null;

    /// <summary>The membership term for a track, falling back to the federation-wide three years.</summary>
    public static int TermYears(string? type) => Get(type)?.TermYears ?? DefaultTermYears;
}
