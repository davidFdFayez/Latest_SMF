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

            return Results.Ok(medical.Describe(file, age, gender));
        });

        /// REQ-04 rule 3 — the consent an under-18's guardian downloads, signs
        /// and uploads. Generated with the athlete's own details on it, so a
        /// parent signs their child's form rather than a blank one.
        group.MapGet("/me/medical/guardian-consent", async (
            ClaimsPrincipal user, SmfDbContext db, HttpContext http, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

            var (age, gender) = AgeAndGender(registration);
            if (age is null or >= 18)
            {
                return Results.Json(new
                {
                    message = "موافقة ولي الأمر مطلوبة لمن هم دون 18 سنة فقط. / "
                              + "A guardian consent is only needed below 18.",
                }, statusCode: StatusCodes.Status409Conflict);
            }

            var entry = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Tournament)
                .Where(e => e.AthleteRegistrationId == registration.Id)
                .OrderByDescending(e => e.CreatedAt)
                .FirstOrDefaultAsync(ct);

            var html = GuardianConsentForm.Render(
                NameOf(registration, arabic: true) ?? registration.ReferenceNumber,
                registration.MembershipNumber,
                entry?.Tournament?.NameAr,
                includePregnancyDeclaration: gender == "female");

            http.Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
            return Results.Content(html, "text/html; charset=utf-8");
        });

        group.MapPut("/me/medical", async (
            MedicalSubmissionRequest request, ClaimsPrincipal user,
            SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var registration = await db.Registrations.AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (registration is null) return Results.NotFound();

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
                a.IsActive,
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

            var (result, invite) = await accounts.InviteAsync(
                request.Email ?? string.Empty,
                request.Kind ?? MemberAccountKinds.Athlete,
                request.RegistrationId,
                holder.RegistrationId,
                request.DisplayName,
                invitedBy: holder.Email,
                ct);

            return result.Ok
                ? Results.Ok(new
                {
                    invite!.Account.Id,
                    invite.Account.Email,
                    invite.AlreadyExisted,
                    invite.Account.IsPending,
                })
                : Problem(result);
        });
    }

    /* ── tournaments, from a member's side (REQ-05/06/07) ───────────────── */

    private static void MapTournaments(RouteGroupBuilder group)
    {
        /// Tournaments open for entry, with this account's athletes and
        /// whether each one may enter (REQ-07 rule 2).
        group.MapGet("/tournaments", async (ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            var now = DateTime.UtcNow;

            var tournaments = await db.Tournaments.AsNoTracking()
                .Where(t => t.Status == TournamentStatuses.Published
                            || t.Status == TournamentStatuses.Closed
                            || t.Status == TournamentStatuses.Running)
                .OrderBy(t => t.StartDate)
                .ToListAsync(ct);

            var athleteIds = await AthleteIdsFor(holder, db, ct);

            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Division)
                .Where(e => athleteIds.Contains(e.AthleteRegistrationId))
                .ToListAsync(ct);

            return Results.Ok(tournaments.Select(t => new
            {
                t.Id,
                t.NameAr,
                t.NameEn,
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
                }),
            }));
        });

        /// REQ-05 rule 4 and REQ-06 rule 4 — when entering a tournament, only
        /// the athletes who are eligible for it are offered.
        group.MapGet("/tournaments/{id:int}/eligible", async (
            int id, ClaimsPrincipal user, SmfDbContext db, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

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
                };
            }));
        });

        group.MapPost("/tournaments/{id:int}/entries", async (
            int id, MemberEntryRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService entries,
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

            // REQ-05 rule 4 and REQ-07 rule 3 — the athlete is told, whoever entered them.
            await NotifyAthleteAsync(db, notifications, tournament, request.AthleteRegistrationId, holder, ct);

            return Results.Ok(new { entry!.Id, entry.Status });
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
    private static async Task<List<int>> AthleteIdsFor(
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

    private static string? NameOf(Registration registration, bool arabic)
    {
        try
        {
            var payload = JsonDocument.Parse(registration.PayloadJson).RootElement;
            return RegistrationPayload.DisplayName(payload, arabic);
        }
        catch (JsonException)
        {
            return null;
        }
    }

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
public record InviteRequest(string? Email, string? Kind, int RegistrationId, string? DisplayName);

public record MemberEntryRequest(
    int AthleteRegistrationId, int? DivisionId, string? Track, string? Category,
    decimal? DeclaredWeightKg, decimal? HeightCm,
    string? ClubName, string? TrainingCentre, string? CoachName, string? CoachPhone);
