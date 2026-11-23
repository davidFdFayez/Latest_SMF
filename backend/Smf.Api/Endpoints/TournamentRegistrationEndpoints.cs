using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// Registering an athlete in a tournament from a member account — Phase 3
/// REQ-03 — and the medical part that belongs to the athlete alone (REQ-04).
///
/// The entry itself is made by the existing entries route; what lives here is
/// what the registration screens read first, and the athlete's Medical File
/// once they are entered:
/// <list type="bullet">
/// <item>The registration form: eligibility (REQ-02, worked out on the server
/// from the athlete's own record), the registration details pre-filled from
/// their profile, and — for the athlete themselves only — the medical
/// section.</item>
/// <item>The Medical File: what each tournament the athlete is entered in
/// still needs from them, and the means to complete it.</item>
/// </list>
/// </summary>
public static class TournamentRegistrationEndpoints
{
    /// <summary>The answers in an athlete's registration that their entry starts from.</summary>
    private static readonly string[] PrefillFields = ["clubName", "coachName", "coachPhone", "currentWeight", "height"];

    /// <summary>Entries that still hold a place in a tournament that is still ahead or under way.</summary>
    private static readonly string[] Inactive = [EntryStatuses.Withdrawn, EntryStatuses.NotEligible];

    public static void MapTournamentRegistration(this RouteGroupBuilder group)
    {
        /// What a registration screen needs to begin: the tournament, the
        /// athlete, where they stand (REQ-02), the details to start from, and
        /// — only when the athlete registers themselves — their medical
        /// section. An athlete may ask only about themselves; a club or a
        /// coach only about an athlete on their own club's roster.
        group.MapGet("/tournaments/{id:int}/registration", async (
            int id, int? athleteRegistrationId, ClaimsPrincipal user,
            SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);

            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null || !MemberEndpoints.MemberVisible(tournament)) return Results.NotFound();

            var athleteId = holder.IsAthlete ? holder.RegistrationId : athleteRegistrationId;
            if (athleteId is null)
            {
                return Refuse(400, "يجب اختيار اللاعب.", "An athlete must be chosen.");
            }

            var allowed = await MemberEndpoints.AthleteIdsFor(holder, db, ct);
            if (!allowed.Contains(athleteId.Value))
            {
                return Refuse(403, "هذا اللاعب ليس ضمن حسابك.", "That athlete is not on your account.");
            }

            var athlete = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == athleteId, ct);
            if (athlete is null) return Results.NotFound();

            var divisions = await db.TournamentDivisions.AsNoTracking().Where(d => d.TournamentId == id).ToListAsync(ct);
            var suspensions = await db.MedicalSuspensions.AsNoTracking()
                .Where(s => s.AthleteRegistrationId == athlete.Id).ToListAsync(ct);
            var entry = await db.TournamentEntries.AsNoTracking().Include(e => e.Division)
                .FirstOrDefaultAsync(e => e.TournamentId == id && e.AthleteRegistrationId == athlete.Id, ct);

            var now = DateTime.UtcNow;
            var verdict = TournamentEligibility.Assess(tournament, athlete, divisions, suspensions, entry is not null, now);

            // The registration details start from the athlete's approved
            // record. Whatever is changed on the form belongs to this entry only.
            var fields = Fields(athlete);
            var prefill = PrefillFields.ToDictionary(name => name, name => fields.GetValueOrDefault(name));

            object? medicalSection = null;
            if (holder.IsAthlete)
            {
                var file = await medical.GetOrCreateAsync(athlete.Id, ct);
                var age = verdict.CompetitionAge;
                var answers = file.Answers();
                var declared = file.Declared();
                var hasScreening = !string.IsNullOrWhiteSpace(file.ScreeningAttachmentId);
                var locks = await medical.ApprovalLocksAsync(athlete.Id, ct);
                medicalSection = new
                {
                    // Final Approval in an active tournament: the file is read-only here.
                    medicalLock = locks.Count == 0 ? null : new
                    {
                        locked = true,
                        tournaments = locks.Select(l => new { l.TournamentId, nameAr = l.TournamentNameAr, nameEn = l.TournamentNameEn })
                            .DistinctBy(l => l.TournamentId),
                    },
                    competitionAge = age,
                    hasCertificate = file.HasCertificate,
                    // A date belongs to a document on file, never on its own.
                    certificateDate = file.HasCertificate ? file.CertificateDate : null,
                    hasScreening,
                    screeningDate = hasScreening ? file.ScreeningDate : null,
                    // REQ-04 rule 1 — the screening only above 15.
                    screeningApplies = age is > 15,
                    questions = HealthQuestions.All.Select(q => new
                    {
                        q.Key, q.Ar, q.En, q.AsksForDetail,
                        answer = answers.TryGetValue(q.Key, out var value) ? value : (bool?)null,
                    }),
                    file.Medications,
                    // REQ-04 rule 3 — who is asked for what, by age and gender.
                    declarationsApply = age is >= 18,
                    declarations = AthleteDeclarations.All.Select(d => new
                    {
                        d.Key, d.Ar, d.En,
                        accepted = declared.TryGetValue(d.Key, out var yes) && yes,
                    }),
                    pregnancyDeclarationApplies = age is >= 18 && verdict.Gender == "female",
                    file.NotPregnantDeclared,
                    guardianConsentApplies = age is not null and < 18,
                    hasGuardianConsent = !string.IsNullOrWhiteSpace(file.GuardianConsentAttachmentId),
                    // Girls under 18: a second, separate signed document.
                    pregnancyDocumentApplies = age is not null and < 18 && verdict.Gender == "female",
                    hasPregnancyDocument = !string.IsNullOrWhiteSpace(file.PregnancyDeclarationAttachmentId),
                };
            }

            return Results.Ok(new
            {
                tournament = new
                {
                    tournament.Id,
                    tournament.NameAr,
                    tournament.NameEn,
                    tournament.StartDate,
                    tournament.EndDate,
                    tournament.LocationAr,
                    tournament.LocationEn,
                    registrationOpen = tournament.IsRegistrationOpen(now),
                },
                athlete = new
                {
                    registrationId = athlete.Id,
                    nameAr = MemberEndpoints.NameOf(athlete, true),
                    nameEn = MemberEndpoints.NameOf(athlete, false),
                    athlete.MembershipNumber,
                },
                registeredBy = holder.Kind,
                eligibility = MemberEndpoints.EligibilityView(tournament, verdict, entry),
                prefill,
                // Null for a club or a coach: the medical part is the athlete's.
                medical = medicalSection,
            });
        });

        /// The athlete's Medical File: what each tournament they are entered
        /// in still needs from them (REQ-04). Nothing when they are entered in
        /// nothing that is still ahead or under way.
        group.MapGet("/me/medical/requirements", async (
            ClaimsPrincipal user, SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var athlete = await db.Registrations.AsNoTracking().FirstOrDefaultAsync(r => r.Id == holder.RegistrationId, ct);
            if (athlete is null) return Results.NotFound();

            var entries = await db.TournamentEntries.AsNoTracking()
                .Include(e => e.Tournament)
                .Where(e => e.AthleteRegistrationId == athlete.Id && !Inactive.Contains(e.Status))
                .Where(e => e.Tournament!.Status == TournamentStatuses.Published
                            || e.Tournament.Status == TournamentStatuses.Closed
                            || e.Tournament.Status == TournamentStatuses.Running)
                .OrderBy(e => e.Tournament!.StartDate)
                .ToListAsync(ct);

            var dateOfBirth = TournamentEligibility.DateOfBirthOf(athlete);
            var gender = TournamentEligibility.GenderOf(athlete);
            var contexts = entries.Select(e => new MedicalFileService.EntryContext(
                e.TournamentId, e.Tournament!.NameAr, e.Tournament.NameEn, e.Tournament.StartDate,
                CompetitionCategories.CompetitionAge(dateOfBirth, TournamentEligibility.TournamentYear(e.Tournament))))
                .ToList();

            var file = await medical.GetOrCreateAsync(athlete.Id, ct);
            return Results.Ok(medical.Requirements(file, contexts, gender,
                await medical.ApprovalLocksAsync(athlete.Id, ct)));
        });

        /// An athlete uploads a medical document for their own file. The id
        /// returned is what their medical submission then names.
        group.MapPost("/me/medical/attachments", async (
            IFormFile? file, ClaimsPrincipal user, RegistrationAttachmentStore store,
            MedicalFileService medical, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();
            // Nothing is stored for a file Final Approval has locked.
            if (await medical.MemberLockedAsync(holder.RegistrationId, ct) is { } locked)
                return Refuse(409, locked.MessageAr, locked.MessageEn);
            if (file is null) return Refuse(400, "لم يتم إرفاق ملف.", "No file was attached.");

            var saved = await store.SaveAsync(file, ct);
            return saved.Succeeded
                ? Results.Ok(saved.Attachment)
                : Results.BadRequest(new { message = saved.Error });
        }).DisableAntiforgery();

        /// The athlete opens a document on their own file — the one in use,
        /// not a replacement still waiting for approval.
        group.MapGet("/me/medical/documents/{slot}", async (
            string slot, ClaimsPrincipal user, MedicalFileService medical,
            RegistrationAttachmentStore store, CancellationToken ct) =>
        {
            var holder = MemberIdentity.Current(user);
            if (!holder.IsAthlete) return Results.Forbid();

            var file = await medical.GetOrCreateAsync(holder.RegistrationId, ct);
            var attachmentId = slot switch
            {
                "certificate" => file.CertificateAttachmentId,
                "screening" => file.ScreeningAttachmentId,
                "guardian_consent" => file.GuardianConsentAttachmentId,
                "pregnancy_declaration" => file.PregnancyDeclarationAttachmentId,
                _ => null,
            };

            if (!store.TryResolve(attachmentId, out var path, out var meta)) return Results.NotFound();
            return Results.File(path, meta.ContentType, meta.FileName);
        });
    }

    /// <summary>The plain string answers of a registration, by field.</summary>
    private static Dictionary<string, string> Fields(Registration registration)
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
                    _ => null,
                };
                if (!string.IsNullOrWhiteSpace(value)) fields[property.Name] = value.Trim();
            }
        }
        catch (JsonException)
        {
            // An unreadable record has nothing to start from.
        }
        return fields;
    }

    private static IResult Refuse(int status, string ar, string en) => Results.Json(new
    {
        message = $"{ar} / {en}",
        messageAr = ar,
        messageEn = en,
    }, statusCode: status);
}
