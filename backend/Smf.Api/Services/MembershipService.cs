using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// The membership lifecycle described in the Phase 2 workflow document: moving
/// a request along its track (§2–§5), enforcing who may do what (§6), and
/// maintaining the three-year term with its renewal, expiry, and suspension
/// rules (§1, §6).
///
/// The admin endpoints used to set <c>Status</c> directly, which meant any
/// authenticated caller could approve anything from any state, nothing was
/// recorded, and the applicant was never told. Every lifecycle change now goes
/// through here so the permission check, the transition check, the audit entry,
/// and the notification cannot be forgotten one at a time.
/// </summary>
public class MembershipService(
    SmfDbContext db,
    AuditLogger audit,
    EmailSender email,
    SmsSender sms,
    IConfiguration configuration,
    ILogger<MembershipService> logger)
{
    /// <param name="Ok">False when the change was refused; nothing was written.</param>
    /// <param name="Status">HTTP status the endpoint should return.</param>
    public record Outcome(bool Ok, int Status, string? MessageAr = null, string? MessageEn = null)
    {
        public static Outcome Success() => new(true, 200);
        public static Outcome Forbidden(string ar, string en) => new(false, 403, ar, en);
        public static Outcome Invalid(string ar, string en) => new(false, 400, ar, en);
    }

    /// <summary>
    /// مهلة استكمال الطلب الناقص, overridable via <c>Membership:CompletionWorkingDays</c>
    /// because §6 marks the seven days "قابلة للتعديل".
    /// </summary>
    private int CompletionWorkingDays =>
        int.TryParse(configuration["Membership:CompletionWorkingDays"], out var days) && days > 0
            ? days
            : MembershipTracks.DefaultCompletionWorkingDays;

    /// <summary>
    /// Moves a request to <paramref name="toStatus"/>, applying every rule that
    /// attaches to that transition. Saves on success; writes nothing on refusal.
    /// </summary>
    public async Task<Outcome> ChangeStatusAsync(
        Registration registration,
        string toStatus,
        AdminIdentity.Actor actor,
        string? reason,
        string? internalNotes,
        string? membershipNumber,
        CancellationToken cancellationToken = default)
    {
        if (!RegistrationStatuses.IsValid(toStatus))
            return Outcome.Invalid($"حالة غير معروفة: {toStatus}", $"Unknown status '{toStatus}'.");

        var fromStatus = registration.Status;

        // §6 — the permission is derived from the destination status, so
        // approving and merely reviewing are separate grants even though both
        // arrive at this one endpoint.
        var required = RegistrationStatuses.RequiredAction(toStatus);
        if (!actor.Can(required))
        {
            await audit.DeniedAsync(actor, required, "registration", registration.Id, cancellationToken);
            return Outcome.Forbidden(
                "لا تملك صلاحية تنفيذ هذا الإجراء على طلبات العضوية.",
                $"Your role does not grant '{required}' on membership requests.");
        }

        if (!RegistrationStatuses.CanTransition(fromStatus, toStatus))
            return Outcome.Invalid(
                $"لا يمكن نقل الطلب من \"{Label(fromStatus)}\" إلى \"{Label(toStatus)}\".",
                $"A request cannot move from '{fromStatus}' to '{toStatus}'.");

        // Rejection, completion requests, and suspensions all quote a reason
        // back to the applicant, so an empty one is a bad request.
        if (RegistrationStatuses.RequiresReason(toStatus) && string.IsNullOrWhiteSpace(reason))
            return Outcome.Invalid(
                "يجب ذكر السبب أو البيانات الناقصة.",
                $"Status '{toStatus}' requires a reason.");

        var now = DateTime.UtcNow;

        registration.Status = toStatus;
        registration.StatusReason = reason;
        registration.StatusChangedAt = now;
        registration.LastActionBy = actor.Username;
        registration.StageOrder = StageFor(registration.Type, toStatus);

        if (internalNotes is not null) registration.InternalNotes = internalNotes;
        if (membershipNumber is not null) registration.MembershipNumber = membershipNumber;

        ApplyStatusSideEffects(registration, toStatus, now);

        audit.Registration(actor, AuditActions.StatusChanged, registration, fromStatus, toStatus, reason);
        await db.SaveChangesAsync(cancellationToken);

        await NotifyAsync(registration, NotificationTemplates.ForStatus(toStatus), cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// تجديد — restarts the three-year term (§1). Renewal extends from the
    /// later of today and the current expiry, so renewing early does not cost
    /// the member the remainder of their term, and renewing late does not
    /// back-date the new one.
    /// </summary>
    public async Task<Outcome> RenewAsync(
        Registration registration,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (!actor.Can(MembershipRoles.Actions.Approve))
        {
            await audit.DeniedAsync(actor, MembershipRoles.Actions.Approve, "registration", registration.Id, cancellationToken);
            return Outcome.Forbidden(
                "التجديد يتطلب صلاحية القبول.",
                "Renewal requires the 'approve' permission.");
        }

        if (registration.Status is not (RegistrationStatuses.Approved or RegistrationStatuses.Expired))
            return Outcome.Invalid(
                "لا يمكن تجديد إلا عضوية معتمدة أو منتهية.",
                "Only an approved or expired membership can be renewed.");

        var now = DateTime.UtcNow;
        var from = registration.ExpiresAt is { } current && current > now ? current : now;
        var fromStatus = registration.Status;

        registration.ExpiresAt = from.AddYears(MembershipTracks.TermYears(registration.Type));
        registration.RenewedAt = now;
        registration.RenewalCount += 1;
        registration.Status = RegistrationStatuses.Approved;
        registration.StatusChangedAt = now;
        registration.LastActionBy = actor.Username;

        audit.Registration(
            actor,
            AuditActions.Renewed,
            registration,
            fromStatus,
            RegistrationStatuses.Approved,
            $"Renewed until {registration.ExpiresAt:yyyy-MM-dd} (renewal #{registration.RenewalCount}).");

        await db.SaveChangesAsync(cancellationToken);
        await NotifyAsync(registration, NotificationTemplates.MembershipRenewed, cancellationToken);

        return Outcome.Success();
    }

    /// <summary>
    /// Retires memberships whose term has elapsed and notifies each one.
    /// Returns how many were expired.
    ///
    /// Expiry is applied as a sweep rather than being inferred at read time so
    /// that the notification fires exactly once and the audit trail records the
    /// moment the membership lapsed.
    /// </summary>
    public async Task<int> ExpireLapsedAsync(AdminIdentity.Actor actor, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;

        var lapsed = await db.Registrations
            .Where(r => r.Status == RegistrationStatuses.Approved
                        && r.ExpiresAt != null
                        && r.ExpiresAt <= now)
            .ToListAsync(cancellationToken);

        if (lapsed.Count == 0) return 0;

        foreach (var registration in lapsed)
        {
            registration.Status = RegistrationStatuses.Expired;
            registration.StatusChangedAt = now;
            registration.StageOrder = StageFor(registration.Type, RegistrationStatuses.Expired);

            audit.Registration(
                actor,
                AuditActions.Expired,
                registration,
                RegistrationStatuses.Approved,
                RegistrationStatuses.Expired,
                $"Term ended {registration.ExpiresAt:yyyy-MM-dd}.");
        }

        await db.SaveChangesAsync(cancellationToken);

        foreach (var registration in lapsed)
            await NotifyAsync(registration, NotificationTemplates.MembershipExpired, cancellationToken);

        logger.LogInformation("Expired {Count} membership(s) whose term had elapsed.", lapsed.Count);
        return lapsed.Count;
    }

    /// <summary>
    /// Memberships inside the renewal warning window, so the federation can act
    /// before the term lapses rather than after.
    /// </summary>
    public async Task<List<Registration>> DueForRenewalAsync(int withinDays, CancellationToken cancellationToken = default)
    {
        var cutoff = DateTime.UtcNow.AddDays(withinDays);

        return await db.Registrations
            .AsNoTracking()
            .Where(r => r.Status == RegistrationStatuses.Approved
                        && r.ExpiresAt != null
                        && r.ExpiresAt <= cutoff)
            .OrderBy(r => r.ExpiresAt)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Requests whose completion window has run out (§6 — مهلة استكمال الطلب
    /// الناقص). Surfaced for the reviewer to chase or close; nothing is
    /// auto-rejected, because §6 gives no such instruction.
    /// </summary>
    public async Task<List<Registration>> OverdueCompletionsAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;

        return await db.Registrations
            .AsNoTracking()
            .Where(r => r.Status == RegistrationStatuses.AwaitingCompletion
                        && r.CompletionDueAt != null
                        && r.CompletionDueAt <= now)
            .OrderBy(r => r.CompletionDueAt)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// إعادة التقديم بعد الرفض (§6). A rejection is terminal, so re-applying
    /// opens a fresh request that points back at the rejected one.
    /// </summary>
    public static void LinkResubmission(Registration fresh, Registration rejected) =>
        fresh.SupersedesId = rejected.Id;

    /// <summary>Field changes that belong to a particular destination status.</summary>
    private void ApplyStatusSideEffects(Registration registration, string toStatus, DateTime now)
    {
        switch (toStatus)
        {
            case RegistrationStatuses.Approved:
                registration.ApprovedAt ??= now;
                // The term runs from the original approval, so a reinstated
                // membership resumes rather than silently gaining three years.
                registration.ExpiresAt ??= (registration.ApprovedAt ?? now)
                    .AddYears(MembershipTracks.TermYears(registration.Type));
                registration.SuspendedAt = null;
                registration.CompletionDueAt = null;
                break;

            case RegistrationStatuses.AwaitingCompletion:
                registration.CompletionDueAt = WorkingDays.CompletionDeadline(now, CompletionWorkingDays);
                break;

            case RegistrationStatuses.Suspended:
                registration.SuspendedAt = now;
                break;

            case RegistrationStatuses.UnderReview:
                // The applicant has responded, so the clock stops.
                registration.CompletionDueAt = null;
                break;

            case RegistrationStatuses.Expired:
                registration.SuspendedAt = null;
                break;
        }
    }

    /// <summary>
    /// The stage a request sits at once it reaches a status. Falls back to the
    /// final stage for the end-of-life statuses, which no track models.
    /// </summary>
    private static int StageFor(string type, string status)
    {
        var track = MembershipTracks.Get(type);
        if (track is null) return 1;

        var stage = track.Stages.FirstOrDefault(s => s.Status == status);
        return stage?.Order ?? track.Stages.Count;
    }

    private static string Label(string status) =>
        RegistrationStatuses.Labels.TryGetValue(status, out var l) ? l.Ar : status;

    /// <summary>
    /// Sends the email and SMS for a lifecycle event (§6). Failures are logged
    /// by the senders and never propagate: the decision is already committed,
    /// and losing a notification must not undo an approval.
    /// </summary>
    private async Task NotifyAsync(Registration registration, string? templateKey, CancellationToken cancellationToken)
    {
        if (templateKey is null) return;

        var template = NotificationTemplates.Get(templateKey);
        if (template is null) return;

        JsonElement payload;
        try
        {
            payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
        }
        catch (JsonException ex)
        {
            logger.LogWarning(ex, "Could not read payload for {Reference}; notification skipped.", registration.ReferenceNumber);
            return;
        }

        var arabic = RegistrationPayload.FirstString(payload, "submittedLanguage") != "en";
        var track = MembershipTracks.Get(registration.Type);

        var values = new Dictionary<string, string?>
        {
            [NotificationTemplates.Vars.Name] = RegistrationPayload.DisplayName(payload, arabic),
            [NotificationTemplates.Vars.RequestNumber] = registration.ReferenceNumber,
            [NotificationTemplates.Vars.RegistrationType] = arabic ? track?.LicenceNameAr : track?.LicenceNameEn,
            [NotificationTemplates.Vars.MembershipNumber] = registration.MembershipNumber,
            [NotificationTemplates.Vars.ExpiryDate] = registration.ExpiresAt?.ToString("yyyy-MM-dd"),
            [NotificationTemplates.Vars.MissingReason] = registration.StatusReason,
            [NotificationTemplates.Vars.RejectionReason] = registration.StatusReason,
            [NotificationTemplates.Vars.SuspensionReason] = registration.StatusReason,
        };

        var recipient = RegistrationPayload.FirstString(payload, "email", "applicantEmail", "officialEmail");
        if (recipient is not null)
        {
            var subject = NotificationTemplates.Render(arabic ? template.SubjectAr : template.SubjectEn, values);
            var body = NotificationTemplates.Render(arabic ? template.BodyAr : template.BodyEn, values);
            await email.SendAsync(recipient, subject, body, cancellationToken);
        }

        var mobile = RegistrationPayload.FirstString(payload, "phone", "mobile", "applicantPhone", "officialPhone");
        if (mobile is not null)
        {
            var text = NotificationTemplates.Render(arabic ? template.SmsAr : template.SmsEn, values);
            await sms.SendAsync(mobile, text, cancellationToken);
        }
    }
}
