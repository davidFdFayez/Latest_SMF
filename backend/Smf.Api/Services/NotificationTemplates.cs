using System.Text.RegularExpressions;
using Smf.Api.Data;

namespace Smf.Api.Services;

/// <summary>
/// Email and SMS copy for registration lifecycle notifications, per the
/// federation's approved content requirements (§11).
///
/// Operational rules baked in here:
///   • every message carries the request number so it can be tracked;
///   • SMS stays short — full detail belongs in the email;
///   • rejection reasons are never put in the SMS body, only in the email.
/// Arabic is the primary template; English is provided alongside it.
/// </summary>
public static class NotificationTemplates
{
    public record Message(string Key, string SubjectAr, string BodyAr, string SmsAr, string SubjectEn, string BodyEn, string SmsEn);

    public const string SubmissionReceived = "submission_received";
    public const string UnderReview = "under_review";
    public const string AwaitingCompletion = "awaiting_completion";
    public const string Approved = "approved";
    public const string Rejected = "rejected";
    public const string DetailsUpdated = "details_updated";
    public const string ResubmittedAfterCompletion = "resubmitted_after_completion";
    public const string ClubApproved = "club_approved";
    public const string RefereeGradeUpdated = "referee_grade_updated";
    public const string CompletionReminder = "completion_reminder";
    public const string MembershipSuspended = "membership_suspended";
    public const string MembershipRenewed = "membership_renewed";
    public const string MembershipExpired = "membership_expired";
    public const string MembershipCancelled = "membership_cancelled";
    public const string RenewalDue = "renewal_due";

    private static readonly Dictionary<string, Message> Templates = new()
    {
        // REG-06 — the confirmation the applicant receives on submit, using the
        // federation's approved wording. The reference number is mandatory in
        // both languages: it is the only handle the applicant has on the request.
        [SubmissionReceived] = new(
            SubmissionReceived,
            "تم استقبال طلب التسجيل — {رقم_الطلب}",
            "مرحباً {الاسم}،\n\nشكراً لتقديم طلب التسجيل كـ {نوع_التسجيل} لدى الاتحاد السعودي للملاكمة التايلندية (SMF).\n\nرقمك المرجعي: {رقم_الطلب}\n\nسنقوم بمراجعة طلبك والتواصل معك قريباً.\n\nالاتحاد السعودي للملاكمة التايلندية | info@saudimuaythai.sa",
            "تم استقبال طلب تسجيلك في الاتحاد السعودي للمواي تاي، رقم الطلب {رقم_الطلب}، وهو قيد المراجعة.",
            "Registration request received — {رقم_الطلب}",
            "Hello {الاسم},\n\nThank you for submitting your {نوع_التسجيل} registration with the Saudi Muaythai Federation (SMF).\n\nYour reference number: {رقم_الطلب}\n\nWe will review your application and be in touch shortly.\n\nSaudi Muaythai Federation | info@saudimuaythai.sa",
            "Your registration request with the Saudi Muaythai Federation, number {رقم_الطلب}, has been received and is under review."),

        [UnderReview] = new(
            UnderReview,
            "طلبك قيد المراجعة — {رقم_الطلب}",
            "طلبك قيد المراجعة حالياً من قبل الاتحاد السعودي للمواي تاي. سيتم التواصل معك في حال الحاجة إلى استكمال أي بيانات أو مرفقات.",
            "طلبك في الاتحاد السعودي للمواي تاي قيد المراجعة.",
            "Your request is under review — {رقم_الطلب}",
            "Your request is currently under review by the Saudi Muaythai Federation. We will contact you if any data or attachments need to be completed.",
            "Your request with the Saudi Muaythai Federation is under review."),

        [AwaitingCompletion] = new(
            AwaitingCompletion,
            "استكمال بيانات الطلب — {رقم_الطلب}",
            "نأمل استكمال طلب التسجيل رقم {رقم_الطلب}. البيانات أو المرفقات المطلوبة: {سبب_النقص}. يمكن استكمال الطلب من خلال الرابط: {الرابط}",
            "طلبك يحتاج استكمال بيانات أو مرفقات. يرجى مراجعة بريدك الإلكتروني أو الرابط المرسل.",
            "Complete your request — {رقم_الطلب}",
            "Please complete registration request {رقم_الطلب}. Required data or attachments: {سبب_النقص}. You can complete the request via: {الرابط}",
            "Your request needs additional data or attachments. Please check your email or the link sent to you."),

        [Approved] = new(
            Approved,
            "تم اعتماد تسجيلك — {رقم_الطلب}",
            "تهانينا، تم اعتماد تسجيلك في الاتحاد السعودي للمواي تاي كـ {نوع_التسجيل}. يمكنك الآن متابعة حسابك والاستفادة من الخدمات المتاحة.",
            "تم اعتماد تسجيلك في الاتحاد السعودي للمواي تاي كـ {نوع_التسجيل}.",
            "Your registration is approved — {رقم_الطلب}",
            "Congratulations, your registration with the Saudi Muaythai Federation as {نوع_التسجيل} has been approved. You can now access your account and the available services.",
            "Your registration with the Saudi Muaythai Federation as {نوع_التسجيل} has been approved."),

        [Rejected] = new(
            Rejected,
            "بخصوص طلب التسجيل — {رقم_الطلب}",
            "نعتذر، لم يتم اعتماد طلب التسجيل رقم {رقم_الطلب}. سبب الرفض: {سبب_الرفض}. يمكنكم التواصل مع الاتحاد في حال وجود استفسار أو رغبة في تقديم طلب جديد.",
            // Deliberately omits the reason — SMS points the applicant to email.
            "لم يتم اعتماد طلب التسجيل رقم {رقم_الطلب}. يرجى مراجعة البريد الإلكتروني لمعرفة السبب.",
            "Regarding your registration request — {رقم_الطلب}",
            "We are sorry, registration request {رقم_الطلب} was not approved. Reason: {سبب_الرفض}. You may contact the federation with any question or to submit a new request.",
            "Registration request {رقم_الطلب} was not approved. Please check your email for the reason."),

        [DetailsUpdated] = new(
            DetailsUpdated,
            "تم تحديث بيانات الطلب — {رقم_الطلب}",
            "تم تحديث بيانات طلب التسجيل رقم {رقم_الطلب}. سيتم مراجعة التحديثات من قبل الاتحاد إذا كانت تتطلب اعتماداً.",
            "تم تحديث بيانات طلبك رقم {رقم_الطلب}.",
            "Request details updated — {رقم_الطلب}",
            "The details of registration request {رقم_الطلب} have been updated. The federation will review the updates if they require approval.",
            "The details of your request {رقم_الطلب} have been updated."),

        [ResubmittedAfterCompletion] = new(
            ResubmittedAfterCompletion,
            "تم استلام الاستكمال — {رقم_الطلب}",
            "تم استلام البيانات أو المرفقات المستكملة لطلبك رقم {رقم_الطلب}. تمت إعادة الطلب للمراجعة من قبل الاتحاد.",
            "تم استلام استكمال طلبك رقم {رقم_الطلب} وإعادته للمراجعة.",
            "Completion received — {رقم_الطلب}",
            "The completed data or attachments for request {رقم_الطلب} have been received. The request has been returned to the federation for review.",
            "The completion of your request {رقم_الطلب} has been received and returned for review."),

        [ClubApproved] = new(
            ClubApproved,
            "تم اعتماد تسجيل {اسم_النادي}",
            "تم اعتماد تسجيل {اسم_النادي} لدى الاتحاد السعودي للمواي تاي. يمكن لمسؤول الحساب متابعة بيانات النادي والفروع والمدربين من خلال لوحة التحكم.",
            "تم اعتماد تسجيل {اسم_النادي} لدى الاتحاد السعودي للمواي تاي.",
            "{اسم_النادي} registration approved",
            "The registration of {اسم_النادي} with the Saudi Muaythai Federation has been approved. The account administrator can manage club, branch, and coach details from the dashboard.",
            "The registration of {اسم_النادي} with the Saudi Muaythai Federation has been approved."),

        [RefereeGradeUpdated] = new(
            RefereeGradeUpdated,
            "تحديث التصنيف التحكيمي",
            "تم تحديث تصنيفك التحكيمي في الاتحاد السعودي للمواي تاي إلى: {تصنيف_الحكم}. ويمكنك مراجعة بياناتك من خلال حسابك.",
            "تم تحديث تصنيفك التحكيمي إلى {تصنيف_الحكم}.",
            "Refereeing grade updated",
            "Your refereeing grade with the Saudi Muaythai Federation has been updated to: {تصنيف_الحكم}. You can review your details in your account.",
            "Your refereeing grade has been updated to {تصنيف_الحكم}."),

        [CompletionReminder] = new(
            CompletionReminder,
            "تذكير باستكمال الطلب — {رقم_الطلب}",
            "نذكركم باستكمال طلب التسجيل رقم {رقم_الطلب}. لا يزال الطلب بانتظار البيانات أو المرفقات المطلوبة حتى يتمكن الاتحاد من مراجعته.",
            "تذكير: طلبك رقم {رقم_الطلب} يحتاج استكمال حتى تتم مراجعته.",
            "Reminder to complete your request — {رقم_الطلب}",
            "This is a reminder to complete registration request {رقم_الطلب}. The request is still awaiting the required data or attachments before the federation can review it.",
            "Reminder: your request {رقم_الطلب} needs completion before it can be reviewed."),

        [MembershipSuspended] = new(
            MembershipSuspended,
            "تعليق حالة التسجيل — {رقم_الطلب}",
            "نفيدكم بأنه تم تعليق حالة التسجيل رقم {رقم_الطلب} مؤقتاً. يمكنكم التواصل مع الاتحاد لمعرفة المتطلبات أو الإجراءات اللازمة.",
            "تم تعليق حالة تسجيلك مؤقتاً. يرجى مراجعة بريدك الإلكتروني للتفاصيل.",
            "Registration suspended — {رقم_الطلب}",
            "We wish to inform you that registration {رقم_الطلب} has been temporarily suspended. Please contact the federation to learn the requirements or steps needed.",
            "Your registration has been temporarily suspended. Please check your email for details."),

        // §6 — تجديد. The three-year term restarts, so the new expiry date is
        // the piece of information the member actually needs.
        [MembershipRenewed] = new(
            MembershipRenewed,
            "تم تجديد العضوية — {رقم_الطلب}",
            "تم تجديد عضويتكم لدى الاتحاد السعودي للملاكمة التايلندية.\n\nرقم العضوية: {رقم_العضوية}\nتاريخ انتهاء العضوية: {تاريخ_الانتهاء}\n\nالاتحاد السعودي للملاكمة التايلندية | info@saudimuaythai.sa",
            "تم تجديد عضويتك في الاتحاد السعودي للمواي تاي حتى {تاريخ_الانتهاء}.",
            "Membership renewed — {رقم_الطلب}",
            "Your membership with the Saudi Muaythai Federation has been renewed.\n\nMembership number: {رقم_العضوية}\nExpires: {تاريخ_الانتهاء}\n\nSaudi Muaythai Federation | info@saudimuaythai.sa",
            "Your Saudi Muaythai Federation membership has been renewed until {تاريخ_الانتهاء}."),

        // §6 — انتهاء. Sent once the term has elapsed without renewal.
        [MembershipExpired] = new(
            MembershipExpired,
            "انتهاء العضوية — {رقم_الطلب}",
            "نفيدكم بانتهاء مدة عضويتكم لدى الاتحاد السعودي للملاكمة التايلندية بتاريخ {تاريخ_الانتهاء}.\n\nلتجديد العضوية يرجى التواصل مع الاتحاد أو تقديم طلب تجديد.\n\nالاتحاد السعودي للملاكمة التايلندية | info@saudimuaythai.sa",
            "انتهت مدة عضويتك في الاتحاد السعودي للمواي تاي بتاريخ {تاريخ_الانتهاء}. يرجى التجديد.",
            "Membership expired — {رقم_الطلب}",
            "Your membership with the Saudi Muaythai Federation expired on {تاريخ_الانتهاء}.\n\nTo renew, please contact the federation or submit a renewal request.\n\nSaudi Muaythai Federation | info@saudimuaythai.sa",
            "Your Saudi Muaythai Federation membership expired on {تاريخ_الانتهاء}. Please renew."),

        // §6 — تنبيه قبل الانتهاء، حتى لا تنتهي العضوية دون إشعار مسبق.
        [RenewalDue] = new(
            RenewalDue,
            "قرب انتهاء العضوية — {رقم_الطلب}",
            "نفيدكم بأن عضويتكم لدى الاتحاد السعودي للملاكمة التايلندية تنتهي بتاريخ {تاريخ_الانتهاء}.\n\nنأمل مباشرة إجراءات التجديد قبل هذا التاريخ لضمان استمرار العضوية.\n\nالاتحاد السعودي للملاكمة التايلندية | info@saudimuaythai.sa",
            "عضويتك في الاتحاد السعودي للمواي تاي تنتهي بتاريخ {تاريخ_الانتهاء}. يرجى التجديد.",
            "Membership renewal due — {رقم_الطلب}",
            "Your membership with the Saudi Muaythai Federation expires on {تاريخ_الانتهاء}.\n\nPlease begin the renewal process before that date to keep the membership active.\n\nSaudi Muaythai Federation | info@saudimuaythai.sa",
            "Your Saudi Muaythai Federation membership expires on {تاريخ_الانتهاء}. Please renew."),

        // §6 — إلغاء. Unlike تعليق this is final, so the copy does not invite
        // the member to wait for reinstatement.
        [MembershipCancelled] = new(
            MembershipCancelled,
            "إلغاء العضوية — {رقم_الطلب}",
            "نفيدكم بإلغاء العضوية رقم {رقم_الطلب}.\n\nالسبب: {سبب_التعليق}\n\nللاستفسار يرجى التواصل مع الاتحاد.\n\nالاتحاد السعودي للملاكمة التايلندية | info@saudimuaythai.sa",
            "تم إلغاء عضويتك في الاتحاد السعودي للمواي تاي. يرجى مراجعة بريدك الإلكتروني للتفاصيل.",
            "Membership cancelled — {رقم_الطلب}",
            "We wish to inform you that membership {رقم_الطلب} has been cancelled.\n\nReason: {سبب_التعليق}\n\nFor any query, please contact the federation.\n\nSaudi Muaythai Federation | info@saudimuaythai.sa",
            "Your Saudi Muaythai Federation membership has been cancelled. Please check your email for details."),
    };

    /// <summary>Template that fires when a request moves into the given status, if any.</summary>
    public static string? ForStatus(string status) => status switch
    {
        RegistrationStatuses.New => SubmissionReceived,
        RegistrationStatuses.UnderReview => UnderReview,
        RegistrationStatuses.AwaitingCompletion => AwaitingCompletion,
        RegistrationStatuses.Approved => Approved,
        RegistrationStatuses.Rejected => Rejected,
        RegistrationStatuses.Suspended => MembershipSuspended,
        RegistrationStatuses.Cancelled => MembershipCancelled,
        RegistrationStatuses.Expired => MembershipExpired,
        _ => null,
    };

    public static Message? Get(string key) => Templates.TryGetValue(key, out var m) ? m : null;

    public static IReadOnlyCollection<Message> All => Templates.Values;

    /// <summary>
    /// Substitutes {اسم_المتغير} placeholders. Unknown placeholders are left
    /// intact rather than blanked, so a missing value is obvious in testing.
    /// </summary>
    public static string Render(string template, IDictionary<string, string?> values)
    {
        if (string.IsNullOrEmpty(template)) return string.Empty;

        return Regex.Replace(template, @"\{([^{}]+)\}", match =>
        {
            var key = match.Groups[1].Value.Trim();
            return values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value)
                ? value
                : match.Value;
        });
    }

    /// <summary>Placeholder names used across the templates.</summary>
    public static class Vars
    {
        public const string Name = "الاسم";
        public const string RegistrationType = "نوع_التسجيل";
        public const string RequestNumber = "رقم_الطلب";
        public const string Link = "الرابط";
        public const string MissingReason = "سبب_النقص";
        public const string RejectionReason = "سبب_الرفض";
        public const string ClubName = "اسم_النادي";
        public const string RefereeGrade = "تصنيف_الحكم";
        public const string MembershipNumber = "رقم_العضوية";
        public const string ExpiryDate = "تاريخ_الانتهاء";
        public const string SuspensionReason = "سبب_التعليق";
    }
}
