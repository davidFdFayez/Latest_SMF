using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Outcome = Smf.Api.Services.TournamentService.Outcome;

namespace Smf.Api.Services;

/// <summary>
/// Inviting, activating and signing in club, coach and athlete accounts —
/// Phase 3 REQ-05, REQ-06 and REQ-07.
///
/// REQ-05 rule 2 is the shape of it: a club adds somebody by email address.
/// If that address already has a live account it is attached immediately; if
/// not, an invitation goes out and the row sits in the list as pending until
/// it is taken up.
/// </summary>
public class MemberAccountService(
    SmfDbContext db,
    IConfiguration configuration,
    NotificationDispatcher notifications,
    AuditLogger audit)
{
    /// <summary>How long an invitation stays usable.</summary>
    public const int InviteValidDays = 14;

    /* ── invitations ────────────────────────────────────────────────────── */

    /// <summary>
    /// What came of an invitation.
    ///
    /// <paramref name="Link"/> and <paramref name="Delivered"/> exist because
    /// an invitation that nobody receives leaves the account unusable, and
    /// only the hash of the token is kept, so there is no reading it back
    /// later. When the message did not leave the building — no SMTP host
    /// configured, or the server refused it — the federation needs the link
    /// in its hand to pass on by whatever other means it has.
    /// </summary>
    public sealed record InviteResult(
        MemberAccount Account,
        bool AlreadyExisted,
        string? Token,
        string? Link = null,
        bool Delivered = false);

    /// <summary>
    /// Attaches an existing account, or creates one and invites it.
    /// </summary>
    /// <param name="registrationId">The membership the account will speak for.</param>
    /// <param name="clubRegistrationId">The club an athlete or coach belongs to.</param>
    public async Task<(Outcome Result, InviteResult? Invite)> InviteAsync(
        string email,
        string kind,
        int registrationId,
        int? clubRegistrationId,
        string? displayName,
        string invitedBy,
        CancellationToken cancellationToken = default)
    {
        var address = (email ?? string.Empty).Trim().ToLowerInvariant();
        if (address.Length == 0 || !address.Contains('@'))
            return (Outcome.Invalid("بريد إلكتروني غير صحيح.", "That is not a valid email address."), null);

        if (!MemberAccountKinds.All.Contains(kind))
            return (Outcome.Invalid("نوع حساب غير معروف.", "Unknown account kind."), null);

        var existing = await db.MemberAccounts
            .FirstOrDefaultAsync(a => a.Email == address, cancellationToken);

        if (existing is not null)
        {
            // REQ-05 rule 2 — a live account is attached directly.
            if (existing.CanSignIn)
            {
                if (existing.Kind != kind)
                {
                    return (Outcome.Conflict(
                        "هذا البريد مرتبط بحساب من نوع آخر.",
                        "That address already belongs to an account of a different kind."), null);
                }

                if (clubRegistrationId is not null && existing.ClubRegistrationId != clubRegistrationId)
                {
                    existing.ClubRegistrationId = clubRegistrationId;
                    await db.SaveChangesAsync(cancellationToken);
                }

                audit.Write(By(invitedBy), AuditActions.MemberAccountUpdated, "member_account",
                    existing.Id, existing.Email,
                    details: "An existing account was attached rather than invited again.");
                await db.SaveChangesAsync(cancellationToken);

                return (Outcome.Success(), new InviteResult(existing, true, null));
            }

            // Pending already: send the invitation again with a fresh token.
            var reissued = Issue(existing);
            existing.InvitedBy = invitedBy;
            await db.SaveChangesAsync(cancellationToken);
            var resent = await SendInviteAsync(existing, reissued, cancellationToken);

            audit.Write(By(invitedBy), AuditActions.MemberAccountInvited, "member_account",
                existing.Id, existing.Email,
                details: resent.Delivered
                    ? "Invitation sent again."
                    : "Invitation sent again; it was not delivered, so the link was shown.");
            await db.SaveChangesAsync(cancellationToken);

            return (Outcome.Success(),
                new InviteResult(existing, false, reissued, resent.Link, resent.Delivered));
        }

        var registration = await db.Registrations
            .FirstOrDefaultAsync(r => r.Id == registrationId, cancellationToken);

        if (registration is null) return (Outcome.NotFound(), null);

        var expectedType = MemberAccountKinds.RegistrationType(kind);
        if (expectedType is not null && registration.Type != expectedType)
        {
            return (Outcome.Conflict(
                "نوع العضوية لا يطابق نوع الحساب.",
                "The membership type does not match the account kind."), null);
        }

        var account = new MemberAccount
        {
            Email = address,
            Kind = kind,
            RegistrationId = registrationId,
            ClubRegistrationId = clubRegistrationId,
            DisplayName = displayName,
            InvitedBy = invitedBy,
        };

        var token = Issue(account);
        db.MemberAccounts.Add(account);
        await db.SaveChangesAsync(cancellationToken);

        var sent = await SendInviteAsync(account, token, cancellationToken);

        audit.Write(By(invitedBy), AuditActions.MemberAccountInvited, "member_account",
            account.Id, account.Email,
            details: sent.Delivered
                ? $"A {kind} account was invited."
                : $"A {kind} account was invited; it was not delivered, so the link was shown.");
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), new InviteResult(account, false, token, sent.Link, sent.Delivered));
    }

    /// <summary>Checks an invitation without spending it, so the page can say whether it is good.</summary>
    public async Task<MemberAccount?> FindInviteAsync(string token, CancellationToken cancellationToken = default)
    {
        var hash = Hash(token);
        var account = await db.MemberAccounts
            .FirstOrDefaultAsync(a => a.InviteTokenHash == hash, cancellationToken);

        return account is not null && account.InviteUsable(DateTime.UtcNow) ? account : null;
    }

    /// <summary>Accepting an invitation: the account chooses a password and becomes usable.</summary>
    public async Task<(Outcome Result, MemberAccount? Account)> ActivateAsync(
        string token,
        string password,
        CancellationToken cancellationToken = default)
    {
        var account = await FindInviteAsync(token, cancellationToken);
        if (account is null)
        {
            return (Outcome.Conflict(
                "رابط الدعوة غير صالح أو منتهي.",
                "That invitation link is not valid, or it has expired."), null);
        }

        if (!PasswordPolicy.IsAcceptable(password))
            return (Outcome.Invalid(PasswordPolicy.MessageAr, PasswordPolicy.MessageEn), null);

        (account.PasswordHash, account.PasswordSalt) = PasswordHasher.HashPassword(password);
        account.SecurityStamp = Guid.NewGuid().ToString("N");
        account.ActivatedAt = DateTime.UtcNow;
        account.InviteTokenHash = null;
        account.InviteExpiresAt = null;
        account.IsActive = true;

        await db.SaveChangesAsync(cancellationToken);
        return (Outcome.Success(), account);
    }

    /* ── signing in ─────────────────────────────────────────────────────── */

    public async Task<(Outcome Result, MemberAccount? Account, string? Token)> SignInAsync(
        string email,
        string password,
        CancellationToken cancellationToken = default)
    {
        var address = (email ?? string.Empty).Trim().ToLowerInvariant();

        var account = await db.MemberAccounts
            .FirstOrDefaultAsync(a => a.Email == address, cancellationToken);

        // One message for every failure: a different answer for "no such
        // account" would let anyone test which addresses are registered.
        var refused = Outcome.Conflict(
            "بيانات الدخول غير صحيحة.",
            "Those sign-in details are not right.");

        if (account?.PasswordHash is null || account.PasswordSalt is null) return (refused, null, null);
        if (!account.CanSignIn) return (refused, null, null);
        if (!PasswordHasher.VerifyPassword(password, account.PasswordHash, account.PasswordSalt))
            return (refused, null, null);

        account.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), account, GenerateToken(account));
    }

    public async Task<Outcome> ChangePasswordAsync(
        MemberAccount account,
        string currentPassword,
        string newPassword,
        CancellationToken cancellationToken = default)
    {
        if (account.PasswordHash is null || account.PasswordSalt is null
            || !PasswordHasher.VerifyPassword(currentPassword, account.PasswordHash, account.PasswordSalt))
        {
            return Outcome.Conflict("كلمة المرور الحالية غير صحيحة.", "The current password is not right.");
        }

        if (!PasswordPolicy.IsAcceptable(newPassword))
            return Outcome.Invalid(PasswordPolicy.MessageAr, PasswordPolicy.MessageEn);

        (account.PasswordHash, account.PasswordSalt) = PasswordHasher.HashPassword(newPassword);
        // Signs every other session out, as the console does.
        account.SecurityStamp = Guid.NewGuid().ToString("N");

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>A member's token: a different audience from the console's, and no permissions on it.</summary>
    public string GenerateToken(MemberAccount account)
    {
        var jwt = configuration.GetSection("Jwt");
        var secret = jwt["Secret"]!;
        var minutes = int.Parse(jwt["MemberExpiryMinutes"] ?? "240");

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, account.Id.ToString()),
            new(ClaimTypes.Email, account.Email),
            new(MemberIdentity.KindClaim, account.Kind),
            new(MemberIdentity.RegistrationClaim, account.RegistrationId.ToString()),
            new(MemberIdentity.StampClaim, account.SecurityStamp),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        if (account.ClubRegistrationId is { } club)
            claims.Add(new Claim(MemberIdentity.ClubClaim, club.ToString()));

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));

        var token = new JwtSecurityToken(
            issuer: jwt["Issuer"],
            audience: MemberIdentity.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(minutes),
            signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /* ── profile changes (REQ-05/06/07, closing rule) ───────────────────── */

    /// <summary>
    /// Records a change the account holder wants to make to their own details.
    /// It is not applied: an authorised user accepts or refuses it.
    /// </summary>
    public async Task<Outcome> ProposeChangeAsync(
        MemberAccount account,
        Dictionary<string, string> changes,
        CancellationToken cancellationToken = default)
    {
        if (changes.Count == 0)
            return Outcome.Invalid("لا توجد تغييرات.", "There is nothing to change.");

        // Identity and eligibility are not the holder's to edit: a changed
        // date of birth would silently move them between age categories.
        var protectedFields = new[]
        {
            "dateOfBirth", "nationalId", "gender", "athleteCategory",
            "eligibleCategories", "competitionTrack", "consent",
        };

        var offending = changes.Keys.FirstOrDefault(k => protectedFields.Contains(k));
        if (offending is not null)
        {
            return Outcome.Conflict(
                $"لا يمكن تعديل هذا الحقل من الحساب: {offending}. راجع الاتحاد.",
                $"That field cannot be changed from an account: {offending}. Please contact the federation.");
        }

        db.MemberProfileChanges.Add(new MemberProfileChange
        {
            MemberAccountId = account.Id,
            RegistrationId = account.RegistrationId,
            ChangesJson = JsonSerializer.Serialize(changes, new JsonSerializerOptions(JsonSerializerDefaults.Web)),
        });

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /// <summary>Applies an accepted change to the membership payload.</summary>
    public async Task<Outcome> ReviewChangeAsync(
        MemberProfileChange change,
        bool approve,
        string? note,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (change.Status != ProfileChangeStatuses.Pending)
            return Outcome.Conflict("تمت مراجعة هذا الطلب.", "This request has already been reviewed.");

        change.Status = approve ? ProfileChangeStatuses.Approved : ProfileChangeStatuses.Rejected;
        change.ReviewedAt = DateTime.UtcNow;
        change.ReviewedBy = actor.Username;
        change.ReviewNote = note;

        if (approve)
        {
            var registration = await db.Registrations
                .FirstOrDefaultAsync(r => r.Id == change.RegistrationId, cancellationToken);

            if (registration is null) return Outcome.NotFound();

            var changes = JsonSerializer.Deserialize<Dictionary<string, string>>(change.ChangesJson)
                          ?? [];

            registration.PayloadJson = RegistrationPayload.WithFields(registration.PayloadJson, changes);

            audit.Registration(actor, AuditActions.Edited, registration,
                details: "Approved an account holder's change: " + string.Join(", ", changes.Keys));
        }

        await db.SaveChangesAsync(cancellationToken);
        return Outcome.Success();
    }

    /* ── helpers ────────────────────────────────────────────────────────── */

    private static string Issue(MemberAccount account)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").TrimEnd('=');

        account.InviteTokenHash = Hash(token);
        account.InviteSentAt = DateTime.UtcNow;
        account.InviteExpiresAt = DateTime.UtcNow.AddDays(InviteValidDays);
        return token;
    }

    /// <summary>
    /// The actor for the log. An invitation can come from the console or from
    /// a club's own portal, so all that is certain is the name it was made
    /// under; it carries no permissions, and nothing here consults any.
    /// </summary>
    private static AdminIdentity.Actor By(string invitedBy) =>
        new(null, string.IsNullOrWhiteSpace(invitedBy) ? "unknown" : invitedBy, null,
            new HashSet<string>());

    private static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));

    /// <summary>
    /// Sends the invitation, and says where it got to. "Delivered" means the
    /// mail server took it; a message written to the outbox because no host
    /// is configured has not been delivered to anybody.
    /// </summary>
    private async Task<(string Link, bool Delivered)> SendInviteAsync(
        MemberAccount account,
        string token,
        CancellationToken cancellationToken)
    {
        var baseUrl = (configuration["Site:BaseUrl"] ?? "https://saudimuaythai.sa").TrimEnd('/');
        var link = $"{baseUrl}/account/activate?token={token}";
        var (kindAr, kindEn) = MemberAccountKinds.Label(account.Kind);

        var subject = "دعوة لتفعيل حسابك — الاتحاد السعودي للملاكمة التايلندية / "
                      + "Activate your Saudi Muaythai Federation account";

        var body = $"""
            مرحبًا،

            تمت دعوتك لتفعيل حساب {kindAr} في منصة الاتحاد السعودي للملاكمة التايلندية.
            لتفعيل الحساب واختيار كلمة المرور، افتح الرابط التالي:

            {link}

            الرابط صالح لمدة {InviteValidDays} يومًا.

            ──────────────────────────────

            Hello,

            You have been invited to activate a {kindEn} account on the Saudi Muaythai
            Federation platform. To activate it and choose a password, open:

            {link}

            The link is valid for {InviteValidDays} days.
            """;

        await notifications.SendAsync(
            registrationId: null,
            entityRef: account.Email,
            templateKey: "member.invitation",
            recipientEmail: account.Email,
            recipientMobile: null,
            subject: subject,
            body: body,
            cancellationToken: cancellationToken);

        // The dispatcher records what happened to it; read that rather than
        // guessing from the configuration, so an SMTP host that is set but
        // refusing counts as undelivered too.
        var status = await db.NotificationLog
            .Where(n => n.TemplateKey == "member.invitation" && n.Recipient == account.Email)
            .OrderByDescending(n => n.Id)
            .Select(n => n.Status)
            .FirstOrDefaultAsync(cancellationToken);

        return (link, status == NotificationStatuses.Sent);
    }

    /// <summary>
    /// A fresh invitation for an account that is still pending, for the case
    /// where the message was sent and never arrived. The old link stops
    /// working, which is the point: there is only ever one live invitation.
    /// </summary>
    public async Task<(Outcome Result, string? Link)> ReissueAsync(
        MemberAccount account,
        AdminIdentity.Actor actor,
        CancellationToken cancellationToken = default)
    {
        if (!account.IsPending)
        {
            return (Outcome.Conflict(
                "الحساب مفعّل بالفعل.",
                "That account is already active."), null);
        }

        var token = Issue(account);
        await db.SaveChangesAsync(cancellationToken);
        var sent = await SendInviteAsync(account, token, cancellationToken);

        // Handing over a link is handing over the account, so it is on the record.
        audit.Write(actor, AuditActions.MemberAccountInvited, "member_account", account.Id,
            account.Email, details: "Activation link reissued and shown to an administrator.");
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), sent.Link);
    }
}
