using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The club, coach and athlete portals — Phase 3 REQ-05, REQ-06 and REQ-07.
///
/// Everything here authenticates against <see cref="MemberIdentity.Scheme"/>,
/// which validates a different audience from the console's. A member's token
/// is not merely unauthorised on an admin endpoint; it fails validation there.
///
/// The three portals share most of their surface — they all list tournaments,
/// open an athlete, and enter athletes — and differ in scope:
///
/// <list type="bullet">
/// <item>A <b>club</b> sees its own athletes and coaches, and may invite more
/// (REQ-05 rule 2).</item>
/// <item>A <b>coach</b> sees the same athletes but may invite nobody
/// (REQ-06 rule 3).</item>
/// <item>An <b>athlete</b> sees only themselves (REQ-07).</item>
/// </list>
/// </summary>
public static class MemberEndpoints
{
    public static void MapMemberEndpoints(this IEndpointRouteBuilder app)
    {
        var open = app.MapGroup("/api/member").WithTags("Member portal");
        MapAuth(open);

        var secured = app.MapGroup("/api/member")
            .WithTags("Member portal")
            .RequireAuthorization(MemberIdentity.Policy);

        MapProfile(secured);
        MapRoster(secured);
        MapTournaments(secured);
        secured.MapClubStatistics();
        secured.MapAthleteRecord();
        secured.MapTournamentRegistration();
        secured.MapMemberInvitations();
        secured.MapMemberNotifications();
    }

    /* ── signing in and activating ──────────────────────────────────────── */

    private static void MapAuth(RouteGroupBuilder group)
    {
        group.MapPost("/login", async (
            MemberLoginRequest request, MemberAccountService accounts, CancellationToken ct) =>
        {
            var (result, account, token) = await accounts.SignInAsync(
                request.Email ?? string.Empty, request.Password ?? string.Empty, ct);

            return result.Ok
                ? Results.Ok(new
                {
                    token,
                    account!.Email,
                    account.Kind,
                    account.DisplayName,
                    kindAr = MemberAccountKinds.Label(account.Kind).Ar,
                    kindEn = MemberAccountKinds.Label(account.Kind).En,
                })
                : Problem(result);
        }).RequireRateLimiting(RateLimitPolicies.MemberAuth);

        /// Whether an invitation link is still good, so the page can say so
        /// before asking for a password.
        group.MapGet("/activate/{token}", async (
            string token, MemberAccountService accounts, CancellationToken ct) =>
        {
            var account = await accounts.FindInviteAsync(token, ct);
            return Results.Ok(new
            {
                valid = account is not null,
                email = account?.Email,
                kind = account?.Kind,
            });
        }).RequireRateLimiting(RateLimitPolicies.MemberAuth);

        group.MapPost("/activate", async (
            ActivateRequest request, MemberAccountService accounts, CancellationToken ct) =>
        {
            var (result, account) = await accounts.ActivateAsync(
                request.Token ?? string.Empty, request.Password ?? string.Empty, ct);

            return result.Ok
                ? Results.Ok(new { token = accounts.GenerateToken(account!), account!.Kind, account.Email })
                : Problem(result);
        }).RequireRateLimiting(RateLimitPolicies.MemberAuth);
    }

    /* ── the account's own record ───────────────────────────────────────── */

    private static void MapProfile(RouteGroupBuilder group)
    {
        group.MapGet("/me", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

            var club = holder.ClubRegistrationId is { } clubId
                ? await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == clubId, ct)
                : null;

            var pending = await db.MemberProfileChanges.AsNoTracking()
                .CountAsync(c => c.MemberAccountId == holder.AccountId
                                 && c.Status == ProfileChangeStatuses.Pending, ct);

            return Results.Ok(new
            {
                holder.AccountId,
                holder.Email,
                holder.Kind,
                kindAr = MemberAccountKinds.Label(holder.Kind).Ar,
                kindEn = MemberAccountKinds.Label(holder.Kind).En,
                membership = Describe(registration),
                // REQ-06 rule 1 — a coach's page names the club they are with.
                club = club is null ? null : new
                {
                    club.Id,
                    club.ReferenceNumber,
                    club.MembershipNumber,
                    nameAr = NameOf(club, true),
                    nameEn = NameOf(club, false),
                },
                pendingChanges = pending,
            });
        });

        /// REQ-05 rule 6, REQ-06 rule 6, REQ-07 rule 6 — an edit is proposed,
        /// not applied. An authorised user accepts it.
        group.MapPost("/me/changes", async (
            ProfileChangeRequest request, ClaimsPrincipal user,
            SmfDbContext db, MemberAccountService accounts, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var account = await db.MemberAccounts.FirstOrDefaultAsync(a => a.Id == holder.AccountId, ct);
            if (account is null) return Results.NotFound();

            var result = await accounts.ProposeChangeAsync(account, request.Changes ?? [], ct);
            return result.Ok
                ? Results.Ok(new
                {
                    submitted = true,
                    messageAr = "تم إرسال التعديل للمراجعة، وسيظهر بعد اعتماده.",
                    messageEn = "Your change has been sent for review and appears once it is approved.",
                })
                : Problem(result);
        });

        /// The member's own registration answers — the approved, official
        /// record — and, apart from it, whatever they have proposed that an
        /// administrator has not yet reviewed. Nothing proposed is shown as if
        /// it were already the record.
        group.MapGet("/me/profile", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

            var pending = await db.MemberProfileChanges.AsNoTracking()
                .Where(c => c.MemberAccountId == holder.AccountId && c.Status == ProfileChangeStatuses.Pending)
                .OrderBy(c => c.CreatedAt)
                .ToListAsync(ct);

            // Several pending proposals read as one: the latest value per field.
            var proposed = new Dictionary<string, string>();
            foreach (var change in pending)
            {
                foreach (var (field, value) in JsonSerializer.Deserialize<Dictionary<string, string>>(change.ChangesJson) ?? [])
                    proposed[field] = value;
            }

            return Results.Ok(new
            {
                registration.Type,
                registration.MembershipNumber,
                registration.ReferenceNumber,
                registration.Status,
                registration.ApprovedAt,
                registration.ExpiresAt,
                logoUrl = PhotoUrl(registration),
                fields = PayloadFields(registration),
                pending = pending.Count == 0 ? null : new
                {
                    since = pending[0].CreatedAt,
                    changes = proposed,
                },
            });
        });

        group.MapPost("/me/password", async (
            ChangePasswordRequest request, ClaimsPrincipal user,
            SmfDbContext db, MemberAccountService accounts, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var account = await db.MemberAccounts.FirstOrDefaultAsync(a => a.Id == holder.AccountId, ct);
            if (account is null) return Results.NotFound();

            var result = await accounts.ChangePasswordAsync(
                account, request.CurrentPassword ?? string.Empty, request.NewPassword ?? string.Empty, ct);

            return result.Ok ? Results.Ok(new { changed = true }) : Problem(result);
        });

        /// REQ-07 rule 1 — an athlete manages their own medical file.
        group.MapGet("/me/medical", async (
            ClaimsPrincipal user, SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

            var file = await medical.GetOrCreateAsync(holder.RegistrationId, ct);
            var (age, gender) = AgeAndGender(registration);

            return Results.Ok(medical.Describe(file, age, gender,
                await medical.ApprovalLocksAsync(holder.RegistrationId, ct)));
        });

        /// REQ-04 rule 3 — the consent an under-18's guardian downloads, signs
        /// and uploads. Generated with the athlete's own details on it, so a
        /// parent signs their child's form rather than a blank one.
        group.MapGet("/me/medical/guardian-consent", (
            int? tournamentId, ClaimsPrincipal user, SmfDbContext db, HttpContext http, CancellationToken ct) =>
            GuardianFormAsync(user, db, http, tournamentId, pregnancy: false, ct));

        /// The non-pregnancy declaration a girl under 18's guardian signs —
        /// its own form, apart from the guardian consent.
        group.MapGet("/me/medical/pregnancy-declaration", (
            int? tournamentId, ClaimsPrincipal user, SmfDbContext db, HttpContext http, CancellationToken ct) =>
            GuardianFormAsync(user, db, http, tournamentId, pregnancy: true, ct));

        group.MapPut("/me/medical", async (
            MedicalSubmissionRequest request, ClaimsPrincipal user,
            SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

            // Final Approval in an active tournament locks the file against
            // the athlete's own changes — answers, declarations and documents.
            if (await medical.MemberLockedAsync(holder.RegistrationId, ct) is { } locked) return Problem(locked);

            var file = await medical.GetOrCreateAsync(holder.RegistrationId, ct);

            // REQ-04 rule 5 — a replacement document from the athlete waits
            // for approval rather than taking effect.
            var result = await medical.SubmitAsync(file, request.ToSubmission(),
                selfService: true, actor: null, ct);

            if (!result.Ok) return Problem(result);

            var (age, gender) = AgeAndGender(registration);
            return Results.Ok(medical.Describe(file, age, gender));
        });
    }

    /* ── the club's and coach's roster (REQ-05, REQ-06) ─────────────────── */

    private static void MapRoster(RouteGroupBuilder group)
    {
        group.MapGet("/roster", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            // REQ-07 — an athlete's page is their own record. The roster
            // belongs to the club and the coaches who work there; an athlete
            // has no business reading a list of their club-mates.
            if (holder.IsAthlete || holder.ClubScope is not { } clubId)
                return Results.Ok(new { athletes = Array.Empty<object>(), coaches = Array.Empty<object>(), canInvite = false });

            var accounts = await db.MemberAccounts.AsNoTracking()
                .Include(a => a.Registration)
                .Where(a => a.ClubRegistrationId == clubId)
                .ToListAsync(ct);

            var year = DateTime.UtcNow.Year;

            object Shape(MemberAccount a) => new
            {
                a.Id,
                a.Email,
                a.Kind,
                a.DisplayName,
                registrationId = a.RegistrationId,
                nameAr = a.Registration is null ? null : NameOf(a.Registration, true),
                nameEn = a.Registration is null ? null : NameOf(a.Registration, false),
                membershipNumber = a.Registration?.MembershipNumber,
                membershipStatus = a.Registration?.Status,
                // REQ-05 rule 2 — an invitation not yet taken up shows as pending.
                a.IsPending,
                a.InviteSentAt,
                a.ActivatedAt,
                a.CreatedAt,
                a.IsActive,
                // What the club's roster shows of each person, all from their
                // own membership record.
                gender = a.Registration is null ? null : TournamentEligibility.GenderOf(a.Registration),
                category = a.Registration is null || a.Kind != MemberAccountKinds.Athlete
                    ? null
                    : CompetitionCategories.PrimaryFor(TournamentEligibility.DateOfBirthOf(a.Registration), year),
                photoUrl = PhotoUrl(a.Registration),
                coach = a.Kind == MemberAccountKinds.Coach && a.Registration is not null
                    ? CoachFacts(a.Registration)
                    : null,
            };

            return Results.Ok(new
            {
                athletes = accounts.Where(a => a.Kind == MemberAccountKinds.Athlete).Select(Shape),
                coaches = accounts.Where(a => a.Kind == MemberAccountKinds.Coach).Select(Shape),
                // REQ-06 rule 3 — a coach may not add or invite anybody.
                canInvite = holder.IsClub,
            });
        });

        /// REQ-05 rule 2 — the club adds an athlete or a coach by email.
        group.MapPost("/roster/invite", async (
            InviteRequest request, ClaimsPrincipal user,
            SmfDbContext db, MemberAccountService accounts, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            // REQ-06 rule 3, enforced rather than merely hidden.
            if (!holder.IsClub)
            {
                return Results.Json(new
                {
                    message = "إضافة اللاعبين من صلاحية النادي. / Only a club can add athletes or coaches.",
                    messageAr = "إضافة اللاعبين من صلاحية النادي.",
                    messageEn = "Only a club can add athletes or coaches.",
                }, statusCode: StatusCodes.Status403Forbidden);
            }

            var kind = request.Kind ?? MemberAccountKinds.Athlete;
            if (kind is not (MemberAccountKinds.Athlete or MemberAccountKinds.Coach))
                return Problem(TournamentService.Outcome.Invalid(
                    "يضيف النادي لاعبين ومدربين فقط.", "A club adds athletes and coaches only."));

            var address = (request.Email ?? string.Empty).Trim().ToLowerInvariant();

            // An account belongs to one club: another club's athlete is not
            // moved by an invitation.
            var existing = await db.MemberAccounts.AsNoTracking()
                .FirstOrDefaultAsync(a => a.Email == address, ct);
            if (existing?.ClubRegistrationId is { } otherClub && otherClub != holder.RegistrationId)
            {
                return Problem(TournamentService.Outcome.Conflict(
                    "هذا الشخص مرتبط بنادٍ آخر.", "This person is already linked to another club."));
            }

            // The club gives an email address; the membership it belongs to is
            // the approved one registered under it. (A registration id may
            // still be given directly, as before.)
            var registrationId = request.RegistrationId ?? existing?.RegistrationId
                ?? (await accounts.FindApprovedRegistrationAsync(
                        address, MemberAccountKinds.RegistrationType(kind), ct))?.Id;

            if (registrationId is null)
            {
                return Problem(TournamentService.Outcome.Conflict(
                    kind == MemberAccountKinds.Coach
                        ? "لا يوجد مدرب بعضوية معتمدة مسجل بهذا البريد. يجب أن يسجل ويُعتمد أولًا."
                        : "لا يوجد لاعب بعضوية معتمدة مسجل بهذا البريد. يجب أن يسجل ويُعتمد أولًا.",
                    kind == MemberAccountKinds.Coach
                        ? "No coach with an approved membership is registered under this email. They need to register and be approved first."
                        : "No athlete with an approved membership is registered under this email. They need to register and be approved first."));
            }

            // A coach or an athlete is asked, not attached: their account is
            // made ready (or reused) with no club on it, and the club's
            // invitation waits for their answer. Only accepting links them.
            var (ready, memberInvite) = await accounts.InviteAsync(
                address, kind, registrationId.Value, clubRegistrationId: null,
                request.DisplayName, invitedBy: holder.Email, ct);
            if (!ready.Ok) return Problem(ready);

            var member = memberInvite!.Account;
            if (member.ClubRegistrationId == holder.RegistrationId)
            {
                return Problem(TournamentService.Outcome.Conflict(
                    kind == MemberAccountKinds.Coach
                        ? "هذا المدرب ضمن مدربي النادي بالفعل."
                        : "هذا اللاعب ضمن لاعبي النادي بالفعل.",
                    kind == MemberAccountKinds.Coach
                        ? "This coach is already one of the club's coaches."
                        : "This athlete is already one of the club's players."));
            }

            var club = await db.Registrations.FirstAsync(r => r.Id == holder.RegistrationId, ct);
            var invitation = await MemberInvitationEndpoints.InviteMemberAsync(db, club, member, holder.Email, ct);

            return Results.Ok(new
            {
                member.Id,
                member.Email,
                memberInvite.AlreadyExisted,
                IsPending = true,
                invitationId = invitation.Id,
                invitationStatus = invitation.Status,
            });
        });

        /// The club withdraws an invitation nobody has taken up yet. Its trace
        /// stays in the audit log; the roster no longer shows it.
        group.MapDelete("/roster/{accountId:int}/invitation", async (
            int accountId, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsClub) return Results.Forbid();

            var account = await db.MemberAccounts
                .FirstOrDefaultAsync(a => a.Id == accountId && a.ClubRegistrationId == holder.RegistrationId, ct);
            if (account is null) return Results.NotFound();

            if (!account.IsPending)
            {
                return Problem(TournamentService.Outcome.Conflict(
                    "قُبلت هذه الدعوة ولا يمكن إلغاؤها.", "This invitation has been accepted and cannot be cancelled."));
            }

            // An account this club's invitation created goes with it; one that
            // existed beforehand is only unlinked from the club.
            if (account.InvitedBy == holder.Email && account.PasswordHash is null)
            {
                db.MemberAccounts.Remove(account);
            }
            else
            {
                account.ClubRegistrationId = null;
                account.InviteTokenHash = null;
                account.InviteExpiresAt = null;
            }

            audit.Write(
                new AdminIdentity.Actor(null, holder.Email, null, new HashSet<string>()),
                AuditActions.MemberAccountUpdated, "member_account", accountId, account.Email,
                details: "The club cancelled a pending invitation.");
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { cancelled = true });
        });

        /// The club lets one of its players or coaches go. Only the link to
        /// the club ends: the account, the membership, past invitations and
        /// tournament entries all stay. Coming back means a new invitation.
        group.MapPost("/roster/{accountId:int}/remove", async (
            int accountId, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsClub) return Results.Forbid();

            // Only someone on this club's roster: another club's member reads
            // as not found, whatever id is sent.
            var account = await db.MemberAccounts
                .FirstOrDefaultAsync(a => a.Id == accountId && a.ClubRegistrationId == holder.RegistrationId
                                          && (a.Kind == MemberAccountKinds.Athlete || a.Kind == MemberAccountKinds.Coach), ct);
            if (account is null) return Results.NotFound();

            // An athlete who never took up the invitation is withdrawn by
            // cancelling it, not removed.
            if (account.Kind == MemberAccountKinds.Athlete && account.IsPending)
            {
                return Problem(TournamentService.Outcome.Conflict(
                    "لم تُقبل هذه الدعوة بعد؛ ألغِ الدعوة بدلًا من ذلك.",
                    "This invitation has not been taken up yet; cancel the invitation instead."));
            }

            account.ClubRegistrationId = null;

            var club = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            var clubAr = (club is null ? null : NameOf(club, true)) ?? "النادي";
            var clubEn = (club is null ? null : NameOf(club, false)) ?? "the club";
            MemberNotifications.Add(db, account.Id, MemberNotificationTypes.ClubMembershipEnded,
                new MemberNotifications.Text("انتهاء الارتباط بالنادي", "Club link ended"),
                new MemberNotifications.Text($"تم إنهاء ارتباطك بـ{clubAr}.", $"Your link with {clubEn} has ended."),
                account.Kind == MemberAccountKinds.Coach ? "/account/coach" : "/account/athlete",
                holder.RegistrationId);

            audit.Write(
                new AdminIdentity.Actor(null, holder.Email, null, new HashSet<string>()),
                AuditActions.MemberAccountUpdated, "member_account", accountId, account.Email,
                details: $"The club removed this {account.Kind} from its roster.");
            await db.SaveChangesAsync(ct);

            return Results.Ok(new { removed = true, account.Id, account.Kind });
        });
    }

    /// <summary>
    /// The member's photo (or a club's logo), through the membership card's
    /// own route, which serves it by the card token. Null without either.
    /// </summary>
    internal static string? PhotoUrl(Registration? registration) =>
        registration?.CardToken is { } token && MembershipCards.PhotoId(registration) is not null
            ? $"/api/membership-card/{token}/photo"
            : null;

    /// <summary>
    /// The plain answers of a registration form, as text: strings, numbers and
    /// yes/no. Uploaded documents and nested values are left out.
    /// </summary>
    private static Dictionary<string, string> PayloadFields(Registration registration)
    {
        var fields = new Dictionary<string, string>();
        try
        {
            var payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
            if (payload.ValueKind != JsonValueKind.Object) return fields;

            foreach (var property in payload.EnumerateObject())
            {
                var value = property.Value.ValueKind switch
                {
                    JsonValueKind.String => property.Value.GetString(),
                    JsonValueKind.Number => property.Value.GetRawText(),
                    JsonValueKind.True => "true",
                    JsonValueKind.False => "false",
                    _ => null,
                };
                if (!string.IsNullOrWhiteSpace(value)) fields[property.Name] = value.Trim();
            }
        }
        catch (JsonException)
        {
            // An unreadable form has no fields to show.
        }
        return fields;
    }

    /// <summary>What a coach's own registration says about their coaching.</summary>
    private static object CoachFacts(Registration registration)
    {
        var fields = PayloadFields(registration);
        return new
        {
            coachingLevel = fields.GetValueOrDefault("coachingLevel"),
            yearsExperience = fields.GetValueOrDefault("yearsExperience"),
            categoriesCoached = fields.GetValueOrDefault("categoriesCoached"),
        };
    }

    /* ── tournaments, from a member's side (REQ-05/06/07) ───────────────── */

    private static void MapTournaments(RouteGroupBuilder group)
    {
        /// Tournaments open for entry, with this account's athletes and
        /// whether each one may enter (REQ-07 rule 2).
        ///
        /// With open=true, only those taking entries right now — by the same
        /// rule entry itself is checked against (Tournament.IsRegistrationOpen).
        group.MapGet("/tournaments", async (bool? open, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var now = DateTime.UtcNow;

            var tournaments = await db.Tournaments.AsNoTracking()
                .Where(t => t.Status == TournamentStatuses.Published
                            || t.Status == TournamentStatuses.Closed
                            || t.Status == TournamentStatuses.Running)
                .OrderBy(t => t.StartDate)
                .ToListAsync(ct);

            if (open == true) tournaments = tournaments.Where(t => t.IsRegistrationOpen(now)).ToList();

            var athleteIds = await AthleteIdsFor(holder, db, ct);

            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Division)
                .Where(e => athleteIds.Contains(e.AthleteRegistrationId))
                .ToListAsync(ct);

            // The tournament and competition types by name, from their lists.
            var lookups = await db.TournamentLookups.AsNoTracking().ToListAsync(ct);
            TournamentLookup? Lookup(string kind, string value) =>
                lookups.FirstOrDefault(l => l.Kind == kind && l.Value == value);

            return Results.Ok(tournaments.Select(t => new
            {
                t.Id,
                t.NameAr,
                t.NameEn,
                typeAr = Lookup(LookupKinds.TournamentType, t.Type)?.NameAr,
                typeEn = Lookup(LookupKinds.TournamentType, t.Type)?.NameEn,
                competitionTypeAr = Lookup(LookupKinds.CompetitionType, t.CompetitionType)?.NameAr,
                competitionTypeEn = Lookup(LookupKinds.CompetitionType, t.CompetitionType)?.NameEn,
                t.LocationAr,
                t.LocationEn,
                t.StartDate,
                t.EndDate,
                t.RegistrationClosesAt,
                t.Status,
                registrationOpen = t.IsRegistrationOpen(now),
                categories = TournamentService.Split(t.Categories),
                // REQ-05 rule 5 / REQ-07 rule 3 — our athletes and where they stand.
                ourEntries = entries.Where(e => e.TournamentId == t.Id).Select(e => new
                {
                    e.Id,
                    e.AthleteRegistrationId,
                    e.Status,
                    statusAr = EntryStatuses.Labels.TryGetValue(e.Status, out var l) ? l.Ar : e.Status,
                    statusEn = EntryStatuses.Labels.TryGetValue(e.Status, out var l2) ? l2.En : e.Status,
                    divisionLabelAr = e.Division?.Describe(arabic: true),
                    divisionLabelEn = e.Division?.Describe(arabic: false),
                    // REQ-03 — what was registered for this tournament, kept
                    // with the entry and apart from the athlete's profile.
                    e.Category,
                    categoryAr = CompetitionCategories.Label(e.Category).Ar,
                    categoryEn = CompetitionCategories.Label(e.Category).En,
                    e.ClubName,
                    e.CoachName,
                    e.CoachPhone,
                    e.DeclaredWeightKg,
                    e.HeightCm,
                    e.EnteredBy,
                    e.CreatedAt,
                }),
            }));
        });

        /// REQ-05 rule 4 and REQ-06 rule 4 — when entering a tournament, only
        /// the athletes who are eligible for it are offered.
        group.MapGet("/tournaments/{id:int}/eligible", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            // Only a tournament members can see at all: a draft does not exist for them.
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null || !MemberVisible(tournament)) return Results.NotFound();

            var divisions = await db.TournamentDivisions.AsNoTracking()
                .Where(d => d.TournamentId == id).ToListAsync(ct);

            var athleteIds = await AthleteIdsFor(holder, db, ct);

            var athletes = await db.Registrations.AsNoTracking()
                .Where(r => athleteIds.Contains(r.Id))
                .ToListAsync(ct);

            var suspensions = await db.MedicalSuspensions.AsNoTracking()
                .Where(s => athleteIds.Contains(s.AthleteRegistrationId))
                .ToListAsync(ct);

            var entered = await db.TournamentEntries.AsNoTracking()
                .Where(e => e.TournamentId == id && athleteIds.Contains(e.AthleteRegistrationId))
                .Select(e => e.AthleteRegistrationId)
                .ToListAsync(ct);

            var now = DateTime.UtcNow;

            return Results.Ok(athletes.Select(athlete =>
            {
                var verdict = TournamentEligibility.Assess(
                    tournament, athlete,
                    divisions,
                    suspensions.Where(s => s.AthleteRegistrationId == athlete.Id).ToList(),
                    entered.Contains(athlete.Id),
                    now);

                return new
                {
                    registrationId = athlete.Id,
                    nameAr = NameOf(athlete, true),
                    nameEn = NameOf(athlete, false),
                    athlete.MembershipNumber,
                    verdict.CanEnter,
                    verdict.AlreadyEntered,
                    verdict.MustChooseTrack,
                    verdict.Tracks,
                    // Why not, in plain words, rather than simply hiding them.
                    barriers = verdict.Barriers.Select(b => new { b.Code, b.Ar, b.En }),
                    options = verdict.Options,
                    // Every category the athlete's age admits (REQ-02), so a
                    // refusal can name what this tournament does not run.
                    ageEligibleCategories = verdict.AgeEligible.Select(c => new { value = c.Value, ar = c.Ar, en = c.En }),
                };
            }));
        });

        /// REQ-02 — where the signed-in athlete stands against one tournament:
        /// their competition age for its year, every category that age admits,
        /// and — of those — what the tournament actually runs in their gender,
        /// with its official weight classes. Who the athlete is, their date of
        /// birth and their gender all come from their own account and approved
        /// record; nothing in the request can name or change them.
        group.MapGet("/tournaments/{id:int}/eligibility", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null || !MemberVisible(tournament)) return Results.NotFound();

            var athlete = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (athlete is null) return Results.NotFound();

            var divisions = await db.TournamentDivisions.AsNoTracking()
                .Where(d => d.TournamentId == id).ToListAsync(ct);
            var suspensions = await db.MedicalSuspensions.AsNoTracking()
                .Where(s => s.AthleteRegistrationId == athlete.Id).ToListAsync(ct);
            var entry = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Division)
                .FirstOrDefaultAsync(e => e.TournamentId == id && e.AthleteRegistrationId == athlete.Id, ct);

            var verdict = TournamentEligibility.Assess(
                tournament, athlete, divisions, suspensions, entry is not null, DateTime.UtcNow);

            return Results.Ok(EligibilityView(tournament, verdict, entry));
        });

        group.MapPost("/tournaments/{id:int}/entries", async (
            int id, MemberEntryRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService entries, MedicalFileService medical,
            NotificationDispatcher notifications, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            var tournament = await db.Tournaments.FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            // An athlete enters only themselves; a club or coach only their own.
            var athleteIds = await AthleteIdsFor(holder, db, ct);
            if (!athleteIds.Contains(request.AthleteRegistrationId))
            {
                return Results.Json(new
                {
                    message = "هذا اللاعب ليس ضمن حسابك. / That athlete is not on your account.",
                    messageAr = "هذا اللاعب ليس ضمن حسابك.",
                    messageEn = "That athlete is not on your account.",
                }, statusCode: StatusCodes.Status403Forbidden);
            }

            // REQ-03 rule 6 — the weight class is chosen, not worked out
            // from a weight; the division is what the entry is in.
            if (request.DivisionId is null)
            {
                return Problem(TournamentService.Outcome.Invalid(
                    "يجب اختيار الفئة وفئة الوزن.", "A category and a weight class must be chosen."));
            }

            // REQ-04 — the health answers, declarations and documents are the
            // athlete's own. A club or a coach registers the athlete; it does
            // not answer for them.
            if (request.Medical is not null && !holder.IsAthlete)
            {
                return Results.Json(new
                {
                    message = "المعلومات الطبية يستكملها اللاعب بنفسه. / Only the athlete completes their medical information.",
                    messageAr = "المعلومات الطبية يستكملها اللاعب بنفسه.",
                    messageEn = "Only the athlete completes their medical information.",
                }, statusCode: StatusCodes.Status403Forbidden);
            }

            if (request.DeclaredWeightKg is <= 0 or > 300 || request.HeightCm is <= 0 or > 260)
            {
                return Problem(TournamentService.Outcome.Invalid(
                    "الوزن أو الطول المدخل غير صحيح.", "The weight or height given is not valid."));
            }

            var source = holder.Kind switch
            {
                MemberAccountKinds.Club => EntrySources.Club,
                MemberAccountKinds.Coach => EntrySources.Coach,
                _ => EntrySources.Athlete,
            };

            var (result, entry) = await entries.EnterAsync(
                tournament,
                new TournamentEntryService.EntryRequest(
                    request.AthleteRegistrationId, request.DivisionId, request.Track, request.Category,
                    request.DeclaredWeightKg, request.HeightCm, request.ClubName,
                    request.TrainingCentre, request.CoachName, request.CoachPhone),
                source, holder.Email, actor: null, ct);

            if (!result.Ok) return Problem(result);

            // REQ-04 rule 6 — whatever the athlete filled in of their medical
            // section goes to their file; what they left blank waits in their
            // Medical File. It never stands between them and the entry, which
            // is already made.
            // A file locked by Final Approval elsewhere is not changed by a
            // new entry either; the entry stands and the response says so.
            var medicalLocked = request.Medical is not null
                                && await medical.MemberLockedAsync(holder.RegistrationId, ct) is not null;
            if (request.Medical is { } medicalSubmission && !medicalLocked)
            {
                var file = await medical.GetOrCreateAsync(holder.RegistrationId, ct);
                await medical.SubmitAsync(file, medicalSubmission.ToSubmission(), selfService: true, actor: null, ct);
            }

            // REQ-05 rule 4 and REQ-07 rule 3 — the athlete is told, whoever entered them.
            await NotifyAthleteAsync(db, notifications, tournament, request.AthleteRegistrationId, holder, ct);

            // Entered by their club or coach: told in their account too, and
            // led to the tournament; their medical part is theirs to finish.
            if (!holder.IsAthlete)
            {
                var athleteAccount = await db.MemberAccounts.AsNoTracking()
                    .FirstOrDefaultAsync(a => a.RegistrationId == request.AthleteRegistrationId
                                              && a.Kind == MemberAccountKinds.Athlete, ct);
                if (athleteAccount is not null)
                {
                    var by = await RegisteredByAsync(db, holder, ct);
                    MemberNotifications.Add(db, athleteAccount.Id, MemberNotificationTypes.TournamentEntryCreated,
                        new MemberNotifications.Text("تسجيل في بطولة", "Tournament registration"),
                        new MemberNotifications.Text(
                            $"تم تسجيلك في بطولة {tournament.NameAr} بواسطة {by.Ar}.",
                            $"You have been registered in {tournament.NameEn} by {by.En}."),
                        "/account/athlete?section=tournaments", entry!.Id);
                    await db.SaveChangesAsync(ct);
                }
            }

            return Results.Ok(new { entry!.Id, entry.Status, medicalNotApplied = medicalLocked ? "locked" : null });
        });

        /// REQ-07 rule 5 and REQ-05 rule 3 — past tournaments and results.
        group.MapGet("/athletes/{athleteId:int}", async (
            int athleteId, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var athleteIds = await AthleteIdsFor(holder, db, ct);
            if (!athleteIds.Contains(athleteId)) return Results.Forbid();

            var athlete = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Division)
                .Include(e => e.Tournament)
                .Where(e => e.AthleteRegistrationId == athleteId)
                .OrderByDescending(e => e.CreatedAt)
                .ToListAsync(ct);

            return Results.Ok(new
            {
                registrationId = athlete.Id,
                nameAr = NameOf(athlete, true),
                nameEn = NameOf(athlete, false),
                athlete.MembershipNumber,
                athlete.Status,
                athlete.ExpiresAt,
                tournaments = entries.Select(e => new
                {
                    e.Id,
                    tournamentId = e.TournamentId,
                    tournamentNameAr = e.Tournament?.NameAr,
                    tournamentNameEn = e.Tournament?.NameEn,
                    e.Tournament!.StartDate,
                    divisionLabelAr = e.Division?.Describe(arabic: true),
                    divisionLabelEn = e.Division?.Describe(arabic: false),
                    e.Status,
                    statusAr = EntryStatuses.Labels.TryGetValue(e.Status, out var l) ? l.Ar : e.Status,
                    statusEn = EntryStatuses.Labels.TryGetValue(e.Status, out var l2) ? l2.En : e.Status,
                }),
            });
        });
    }

    /* ── helpers ────────────────────────────────────────────────────────── */

    /// <summary>
    /// The athletes this account may act for: itself if an athlete, the club's
    /// roster if a club or a coach (REQ-06 rule 2 — a coach sees all of the
    /// club's athletes, and any new one appears automatically).
    /// </summary>
    /// <summary>A tournament members may see: published, closed for entries, or running.</summary>
    internal static bool MemberVisible(Tournament tournament) =>
        tournament.Status is TournamentStatuses.Published or TournamentStatuses.Closed or TournamentStatuses.Running;

    /// <summary>
    /// REQ-02 — one athlete's standing against one tournament, as the account
    /// pages read it: the year that drives age, the age, the gender on record,
    /// every category the age admits, what the tournament runs of those, and
    /// the entry they already hold, if any.
    /// </summary>
    internal static object EligibilityView(Tournament tournament, TournamentEligibility.Verdict verdict, TournamentEntry? entry) => new
    {
        tournamentId = tournament.Id,
        verdict.TournamentYear,
        verdict.CompetitionAge,
        verdict.Gender,
        // Every category the age admits, overlaps included.
        ageEligibleCategories = verdict.AgeEligible.Select(c => new
        {
            value = c.Value, ar = c.Ar, en = c.En, c.MinAge, c.MaxAge, c.Track,
            offered = verdict.Options.Any(o => o.Category == c.Value),
        }),
        // Of those, what this tournament runs: per category, its classes.
        eligibleCategories = verdict.Options,
        verdict.NoEligibleDivision,
        verdict.CanEnter,
        barriers = verdict.Barriers.Select(b => new { b.Code, b.Ar, b.En }),
        // One category per tournament: an existing entry is that choice.
        existingEntry = entry is null ? null : new
        {
            entry.Id,
            entry.Category,
            categoryAr = CompetitionCategories.Label(entry.Category).Ar,
            categoryEn = CompetitionCategories.Label(entry.Category).En,
            entry.DivisionId,
            divisionAr = entry.Division?.Describe(true),
            divisionEn = entry.Division?.Describe(false),
            entry.Status,
        },
    };

    /// <summary>
    /// One of the two forms an under-18's guardian signs, filled in with the
    /// signed-in athlete's details: the guardian consent, or — for a girl — the
    /// separate non-pregnancy declaration.
    /// </summary>
    private static async Task<IResult> GuardianFormAsync(
        ClaimsPrincipal user, SmfDbContext db, HttpContext http, int? tournamentId, bool pregnancy, CancellationToken ct)
    {
        var holder = MemberIdentity.Current(user);
        if (!holder.IsAthlete) return Results.Forbid();

        var registration = await db.Registrations.AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
        if (registration is null) return Results.NotFound();

        // Whether a form applies follows the athlete's age for the tournament
        // it is for — the one named, else their latest entry's.
        var tournament = await FormTournamentAsync(db, registration.Id, tournamentId, ct);
        var (age, gender) = MedicalAgeAndGender(registration, tournament);
        if (age is null or >= 18 || (pregnancy && gender != "female"))
        {
            return Results.Json(new
            {
                message = pregnancy
                    ? "إقرار عدم الحمل الموقّع مطلوب للاعبات دون 18 سنة فقط. / A signed non-pregnancy declaration is only needed for girls under 18."
                    : "موافقة ولي الأمر مطلوبة لمن هم دون 18 سنة فقط. / A guardian consent is only needed below 18.",
            }, statusCode: StatusCodes.Status409Conflict);
        }

        var name = NameOf(registration, arabic: true) ?? registration.ReferenceNumber;
        var html = pregnancy
            ? GuardianConsentForm.RenderNonPregnancyDeclaration(name, registration.MembershipNumber, tournament?.NameAr)
            : GuardianConsentForm.Render(name, registration.MembershipNumber, tournament?.NameAr);

        http.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return Results.Content(html, "text/html; charset=utf-8");
    }

    /// <summary>Who registered the athlete, by name: the club, or the coach.</summary>
    private static async Task<(string Ar, string En)> RegisteredByAsync(
        SmfDbContext db, MemberIdentity.Holder holder, CancellationToken ct)
    {
        var own = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
        var ar = own is null ? null : NameOf(own, true);
        var en = own is null ? null : NameOf(own, false);
        return holder.IsCoach
            ? ($"المدرب {ar ?? holder.Email}", $"coach {en ?? holder.Email}")
            : (ar ?? holder.Email, en ?? holder.Email);
    }

    internal static async Task<List<int>> AthleteIdsFor(
        MemberIdentity.Holder holder, SmfDbContext db, CancellationToken ct)
    {
        if (holder.IsAthlete) return [holder.RegistrationId];
        if (holder.ClubScope is not { } clubId) return [];

        return await db.MemberAccounts.AsNoTracking()
            .Where(a => a.ClubRegistrationId == clubId && a.Kind == MemberAccountKinds.Athlete)
            .Select(a => a.RegistrationId)
            .ToListAsync(ct);
    }

    private static async Task NotifyAthleteAsync(
        SmfDbContext db,
        NotificationDispatcher notifications,
        Tournament tournament,
        int athleteId,
        MemberIdentity.Holder holder,
        CancellationToken ct)
    {
        var athlete = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == athleteId, ct);
        if (athlete is null) return;

        string? email = null;
        try
        {
            var payload = JsonDocument.Parse(athlete.PayloadJson).RootElement;
            email = RegistrationPayload.FirstString(payload, "email");
        }
        catch (JsonException)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(email)) return;

        var by = holder.IsAthlete ? "نفسك / yourself" : holder.Email;

        await notifications.SendAsync(
            registrationId: athlete.Id,
            entityRef: athlete.ReferenceNumber,
            templateKey: "tournament.entered",
            recipientEmail: email,
            recipientMobile: null,
            subject: $"تم تسجيلك في {tournament.NameAr} / You have been entered in {tournament.NameEn}",
            body: $"""
                تم تسجيلك في بطولة {tournament.NameAr} بواسطة {by}.
                تاريخ البطولة: {tournament.StartDate:yyyy-MM-dd}.
                يمكنك مراجعة حالة التسجيل من حسابك.

                ──────────────────────────────

                You have been entered in {tournament.NameEn} by {by}.
                The tournament starts on {tournament.StartDate:yyyy-MM-dd}.
                You can check your entry from your account.
                """,
            cancellationToken: ct);
    }

    private static object Describe(Registration registration) => new
    {
        registration.Id,
        registration.Type,
        registration.ReferenceNumber,
        registration.MembershipNumber,
        registration.Status,
        registration.ApprovedAt,
        registration.ExpiresAt,
        nameAr = NameOf(registration, true),
        nameEn = NameOf(registration, false),
        isExpired = registration.IsExpired(DateTime.UtcNow),
        daysRemaining = registration.DaysRemaining(DateTime.UtcNow),
    };

    /// <summary>
    /// The name a registration goes by on the member pages. A club's form also
    /// carries the applicant's own name parts; the club is named by its own
    /// name, in the language asked for and then the other, never the applicant's.
    /// </summary>
    internal static string? NameOf(Registration registration, bool arabic)
    {
        try
        {
            var payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
            if (registration.Type == "club")
            {
                return RegistrationPayload.FirstString(payload, arabic ? "nameAr" : "nameEn", arabic ? "nameEn" : "nameAr")
                       ?? RegistrationPayload.DisplayName(payload, arabic);
            }
            return RegistrationPayload.DisplayName(payload, arabic);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// The tournament a medical form is for: the one named, if the athlete
    /// may see it, else the one they most recently entered. Null when neither.
    /// </summary>
    internal static async Task<Tournament?> FormTournamentAsync(
        SmfDbContext db, int athleteRegistrationId, int? tournamentId, CancellationToken ct)
    {
        if (tournamentId is { } id)
        {
            var named = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (named is not null && MemberVisible(named)) return named;
        }

        return await db.TournamentEntries.AsNoTracking()
            .Where(e => e.AthleteRegistrationId == athleteRegistrationId)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => e.Tournament)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// Age for the medical rules: the competition age for the tournament
    /// when there is one (REQ-02 — tournament year minus birth year), so an
    /// athlete is the same age here as in registration and on the desk; the
    /// current year only when no tournament is involved.
    /// </summary>
    internal static (int? Age, string? Gender) MedicalAgeAndGender(Registration athlete, Tournament? tournament) =>
        tournament is null
            ? AgeAndGender(athlete)
            : (CompetitionCategories.CompetitionAge(TournamentEligibility.DateOfBirthOf(athlete),
                   TournamentEligibility.TournamentYear(tournament)),
               TournamentEligibility.GenderOf(athlete));

    private static (int? Age, string? Gender) AgeAndGender(Registration athlete)
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

public record MemberLoginRequest(string? Email, string? Password);
public record ActivateRequest(string? Token, string? Password);
public record ProfileChangeRequest(Dictionary<string, string>? Changes);
public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword);
/// <param name="RegistrationId">Optional: without it, the approved membership registered under the email is used.</param>
public record InviteRequest(string? Email, string? Kind, int? RegistrationId, string? DisplayName);

/// <param name="Medical">The athlete's own medical section, when they register themselves (REQ-04); refused from anyone else.</param>
public record MemberEntryRequest(
    int AthleteRegistrationId, int? DivisionId, string? Track, string? Category,
    decimal? DeclaredWeightKg, decimal? HeightCm,
    string? ClubName, string? TrainingCentre, string? CoachName, string? CoachPhone,
    MedicalSubmissionRequest? Medical = null);
