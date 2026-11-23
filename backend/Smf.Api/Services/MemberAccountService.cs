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
    IHostEnvironment environment,
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
            // REQ-05 rule 2 — a live account is attached directly. Live means
            // taken up: a password chosen, or (while it exists) opened by the
            // temporary development sign-in.
            if (existing is { IsActive: true, ActivatedAt: not null })
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

            if (existing.Kind != kind)
            {
                return (Outcome.Conflict(
                    "هذا البريد مرتبط بحساب من نوع آخر.",
                    "That address already belongs to an account of a different kind."), null);
            }

            // Pending already: send the invitation again with a fresh token,
            // on the same row — never a second invitation for one address.
            var reissued = Issue(existing);
            existing.InvitedBy = invitedBy;
            if (clubRegistrationId is not null) existing.ClubRegistrationId = clubRegistrationId;
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

        // One email, one identity: a new account may not take an address that
        // another registration holds (its own registration and club aside).
        // Checked and saved under the same write lock as a public submission.
        MemberAccount account;
        string pendingToken;
        await using (var reservation = await EmailReservations.BeginExclusiveAsync(db, cancellationToken))
        {
            var own = clubRegistrationId is { } club ? new[] { registrationId, club } : new[] { registrationId };
            if ((await EmailReservations.ReservedAsync(db, [address], own, cancellationToken)).Count > 0)
            {
                return (Outcome.Conflict(
                    "هذا البريد الإلكتروني مسجل مسبقًا لعضوية أخرى.",
                    "That address is already registered to another membership."), null);
            }

            var created = new MemberAccount
            {
                Email = address,
                Kind = kind,
                RegistrationId = registrationId,
                ClubRegistrationId = clubRegistrationId,
                DisplayName = displayName,
                InvitedBy = invitedBy,
            };
            pendingToken = Issue(created);
            db.MemberAccounts.Add(created);
            await db.SaveChangesAsync(cancellationToken);
            await reservation.CommitAsync(cancellationToken);
            account = created;
        }
        var token = pendingToken;

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

        var byPassword = account is { CanSignIn: true, PasswordHash: not null, PasswordSalt: not null }
            && PasswordHasher.VerifyPassword(password, account.PasswordHash, account.PasswordSalt);

        if (!byPassword)
        {
            // TEMPORARY — see DevelopmentMemberSignIn.
            if (!DevelopmentMemberSignIn.Matches(configuration, environment, password)) return (refused, null, null);
            account = await DevelopmentAccountAsync(account, address, cancellationToken);
            if (account is null) return (refused, null, null);
        }

        // Only an approved, live membership opens the portal: a request still
        // under review, rejected, suspended or expired does not.
        if (!await MembershipAllowsSignInAsync(account.RegistrationId, cancellationToken))
            return (refused, null, null);

        account.LastLoginAt = DateTime.UtcNow;
        await db.SaveChangesAsync(cancellationToken);

        return (Outcome.Success(), account, GenerateToken(account));
    }

    /// <summary>True when the membership behind an account is approved and not expired.</summary>
    private async Task<bool> MembershipAllowsSignInAsync(int registrationId, CancellationToken cancellationToken)
    {
        var registration = await db.Registrations.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == registrationId, cancellationToken);

        return registration is not null
            && registration.Status == RegistrationStatuses.Approved
            && !registration.IsExpired(DateTime.UtcNow);
    }

    /// <summary>
    /// TEMPORARY — see <see cref="DevelopmentMemberSignIn"/>. The account the
    /// development password opens for this address: the one that already
    /// exists, or a new one attached to the approved membership registered
    /// under it — the same record an invitation would have created. Null when
    /// there is neither.
    /// </summary>
    private async Task<MemberAccount?> DevelopmentAccountAsync(
        MemberAccount? existing,
        string address,
        CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;

        if (existing is not null)
        {
            if (!existing.IsActive) return null;

            // Signing in stands in for opening the invitation email while no
            // email is sent: a pending invitation is taken up here.
            if (existing.ActivatedAt is null)
            {
                existing.ActivatedAt = now;
                existing.InviteTokenHash = null;
                existing.InviteExpiresAt = null;
                audit.Write(By(DevelopmentMemberSignIn.CreatedBy), AuditActions.MemberAccountUpdated,
                    "member_account", existing.Id, existing.Email,
                    details: "Invitation taken up through the temporary development sign-in.");
                await db.SaveChangesAsync(cancellationToken);
            }

            return existing;
        }

        // Only one approved membership may stand behind a new account: with
        // several (of any type) sharing the address, which one it should be is
        // not this sign-in's to guess, so none is opened. Existing accounts are
        // returned above, unchanged.
        var matches = await FindApprovedRegistrationsAsync(address, cancellationToken);
        if (matches.Count != 1) return null;
        var registration = matches[0];

        var account = new MemberAccount
        {
            Email = address,
            Kind = MemberAccountKinds.ForRegistrationType(registration.Type)!,
            RegistrationId = registration.Id,
            ActivatedAt = now,
            InvitedBy = DevelopmentMemberSignIn.CreatedBy,
        };

        db.MemberAccounts.Add(account);
        await db.SaveChangesAsync(cancellationToken);

        audit.Write(By(DevelopmentMemberSignIn.CreatedBy), AuditActions.MemberAccountUpdated, "member_account",
            account.Id, account.Email,
            details: $"A {account.Kind} account was opened by the temporary development sign-in.");
        await db.SaveChangesAsync(cancellationToken);

        return account;
    }

    /// <summary>
    /// Every approved, live membership registered under this address that opens
    /// an account, newest first — so a caller can tell one from several.
    /// </summary>
    public async Task<IReadOnlyList<Registration>> FindApprovedRegistrationsAsync(
        string email,
        CancellationToken cancellationToken = default)
    {
        var address = (email ?? string.Empty).Trim().ToLowerInvariant();
        if (address.Length == 0 || !address.Contains('@')) return [];

        var candidates = await db.Registrations.AsNoTracking()
            .Where(r => r.Status == RegistrationStatuses.Approved
                && EF.Functions.Like(r.PayloadJson, "%" + address + "%"))
            .OrderByDescending(r => r.Id)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        return candidates.Where(r =>
                !r.IsExpired(now)
                && MemberAccountKinds.ForRegistrationType(r.Type) is not null
                && RegisteredEmails(r).Contains(address))
            .ToList();
    }

    /// <summary>
    /// The approved, live membership registered under this address — of the
    /// given type (athlete, coach, club, official), or of any type that opens
    /// an account when <paramref name="type"/> is null. The most recent wins.
    /// </summary>
    public async Task<Registration?> FindApprovedRegistrationAsync(
        string email,
        string? type,
        CancellationToken cancellationToken = default)
    {
        var address = (email ?? string.Empty).Trim().ToLowerInvariant();
        if (address.Length == 0 || !address.Contains('@')) return null;

        // The address lives inside the stored form, so narrow by text first
        // (LIKE is case-insensitive here) and then read the fields properly.
        var candidates = await db.Registrations.AsNoTracking()
            .Where(r => r.Status == RegistrationStatuses.Approved
                && (type == null || r.Type == type)
                && EF.Functions.Like(r.PayloadJson, "%" + address + "%"))
            .OrderByDescending(r => r.Id)
            .ToListAsync(cancellationToken);

        var now = DateTime.UtcNow;
        return candidates.FirstOrDefault(r =>
            !r.IsExpired(now)
            && MemberAccountKinds.ForRegistrationType(r.Type) is not null
            && RegisteredEmails(r).Contains(address));
    }

    /// <summary>The addresses a registration was made with, lower-cased.</summary>
    private static HashSet<string> RegisteredEmails(Registration registration)
    {
        try
        {
            var payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
            return new[] { "email", "applicantEmail", "officialEmail" }
                .Select(key => RegistrationPayload.FirstString(payload, key))
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value!.Trim().ToLowerInvariant())
                .ToHashSet();
        }
        catch (JsonException)
        {
            return [];
        }
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

        // REG-11 — a proposed current weight is held to the registration form's
        // own rule, so a profile edit cannot store what registering would refuse.
        if (await WeightRefusedAsync(account.RegistrationId, changes, cancellationToken) is { } refused)
            return refused;

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

        // A request proposed before the rule (or crafted around it) is not
        // applied with a weight the registration form would refuse; it can
        // still be rejected.
        if (approve)
        {
            var proposed = JsonSerializer.Deserialize<Dictionary<string, string>>(change.ChangesJson) ?? [];
            if (await WeightRefusedAsync(change.RegistrationId, proposed, cancellationToken) is { } refused)
                return refused;
        }

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

    /// <summary>
    /// A refusal when the changes carry an athlete's current weight outside the
    /// range registration accepts for their age (RegistrationValidator); null otherwise.
    /// </summary>
    private async Task<Outcome?> WeightRefusedAsync(
        int registrationId, IReadOnlyDictionary<string, string> changes, CancellationToken cancellationToken)
    {
        if (!changes.TryGetValue("currentWeight", out var weight)) return null;

        var registration = await db.Registrations.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == registrationId, cancellationToken);
        if (registration is null || registration.Type != "athlete") return null;

        string? dateOfBirth = null;
        try
        {
            dateOfBirth = RegistrationPayload.FirstString(
                JsonDocument.Parse(registration.PayloadJson).RootElement, "dateOfBirth");
        }
        catch (JsonException)
        {
            // An unreadable record: judged on the widest range.
        }

        return RegistrationValidator.CurrentWeightProblem(dateOfBirth, weight) is { } failure
            ? Outcome.Invalid(failure.Ar, $"Current weight: {failure.En}")
            : null;
    }

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
