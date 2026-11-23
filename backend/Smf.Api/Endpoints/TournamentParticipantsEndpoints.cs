using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Smf.Api.Data;
using Smf.Api.Data.Models;
using Smf.Api.Services;

namespace Smf.Api.Endpoints;

/// <summary>
/// The admin Participants page: who is registered in a tournament, grouped by
/// division, with what each still owes their Medical File.
///
/// Read-only apart from one correction — an entry's category and weight class
/// (REQ-03 rule 7), held to the same eligibility rules as entering. The
/// requirements status is tracking only: an incomplete file never touches the
/// entry.
/// </summary>
public static class TournamentParticipantsEndpoints
{
    public static void MapTournamentParticipants(this RouteGroupBuilder admin)
    {
        var group = admin.MapGroup("/tournaments").WithTags("Tournaments");

        group.MapGet("/{id:int}/participants", async (int id, SmfDbContext db, MedicalFileService medical, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var (participants, divisions) = await LoadAsync(tournament, db, ct);
            var locked = await medical.LockedAthletesAsync(
                participants.Select(p => p.Entry.AthleteRegistrationId).Distinct().ToList(), ct);

            return Results.Ok(new
            {
                tournament = new { tournament.Id, tournament.NameEn, tournament.NameAr, tournament.StartDate },
                participants = participants.Select(p => Describe(p, divisions, tournament, locked.Contains(p.Entry.AthleteRegistrationId))),
            });
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical,
            AdminPermissions.TournamentManage, AdminPermissions.TournamentDraw);

        group.MapPut("/entries/{entryId:int}/category", async (
            int entryId, ParticipantCategoryRequest request, ClaimsPrincipal user,
            SmfDbContext db, TournamentEntryService service, CancellationToken ct) =>
        {
            var entry = await db.TournamentEntries
                .Include(e => e.Tournament)
                .Include(e => e.AthleteRegistration)
                .FirstOrDefaultAsync(e => e.Id == entryId, ct);
            if (entry is null) return Results.NotFound();

            var result = await service.ChangeCategoryAsync(
                entry, request.Category, request.DivisionId, AdminIdentity.Current(user), ct, request.Reason);

            return result.Ok
                ? Results.Ok(new { entry.Id, entry.Category, entry.DivisionId })
                : Results.Json(new
                {
                    message = result.MessageEn,
                    messageAr = result.MessageAr,
                    messageEn = result.MessageEn,
                }, statusCode: result.Status);
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical);

        /* ── the athlete's Medical File, from the Participants page ──────────
           Medical documents are sensitive: these routes need the technical
           team's permission (tournament.technical — the medical examination
           desk), not just the right to see who entered. Everything is reached
           through the entry, so the athlete is the entry's athlete and never
           an id the client supplied. */

        group.MapGet("/entries/{entryId:int}/medical", async (
            int entryId, ClaimsPrincipal user, SmfDbContext db, MedicalFileService medical,
            RegistrationAttachmentStore store, CancellationToken ct) =>
        {
            var entry = await LoadEntryAsync(entryId, db, ct);
            if (entry is null) return Results.NotFound();
            if (!await MayReadMedicalAsync(entry, AdminIdentity.Current(user), medical, ct)) return Refuse(403, MedicalReadDenied);

            var file = await medical.GetOrCreateAsync(entry.AthleteRegistrationId, ct);
            return Results.Ok(DescribeMedical(entry, file, store));
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDirector);

        group.MapGet("/entries/{entryId:int}/medical/documents/{slot}", async (
            int entryId, string slot, ClaimsPrincipal user, SmfDbContext db, MedicalFileService medical,
            RegistrationAttachmentStore store, AuditLogger audit, CancellationToken ct) =>
        {
            var entry = await LoadEntryAsync(entryId, db, ct);
            if (entry is null) return Results.NotFound();
            if (!await MayReadMedicalAsync(entry, AdminIdentity.Current(user), medical, ct)) return Refuse(403, MedicalReadDenied);

            var (age, gender) = AgeAndGender(entry);
            if (!AthleteMedicalFile.DocumentsFor(age, gender).Contains(slot)) return Results.NotFound();

            var file = await db.AthleteMedicalFiles
                .FirstOrDefaultAsync(f => f.AthleteRegistrationId == entry.AthleteRegistrationId, ct);
            if (file is null || !store.TryResolve(file.AttachmentIn(slot), out var path, out var meta))
                return Results.NotFound();

            audit.Write(AdminIdentity.Current(user), AuditActions.MedicalDocumentViewed, "athlete_medical_file", file.Id,
                entityRef: slot,
                details: $"Opened {slot} for athlete #{entry.AthleteRegistrationId} from entry #{entry.Id}.");
            await db.SaveChangesAsync(ct);

            return Results.File(path, meta.ContentType, meta.FileName);
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDirector);

        group.MapPost("/entries/{entryId:int}/medical/documents/{slot}", async (
            int entryId, string slot, HttpRequest http, ClaimsPrincipal user, SmfDbContext db,
            MedicalFileService medical, RegistrationAttachmentStore store, CancellationToken ct) =>
        {
            var entry = await LoadEntryAsync(entryId, db, ct);
            if (entry is null) return Results.NotFound();
            if (entry.Status == EntryStatuses.Withdrawn)
                return Refuse(409, "A withdrawn entry's medical file cannot be changed from Participants.");
            var actor = AdminIdentity.Current(user);
            var access = await medical.AdminMayChangeAsync(entry.AthleteRegistrationId, entry.DivisionId, actor,
                mayBefore: actor.Has(AdminPermissions.TournamentTechnical), ct, entry);
            if (!access.Ok) return Refuse(access.Status, access.Message);

            var (age, gender) = AgeAndGender(entry);
            if (!AthleteMedicalFile.DocumentsFor(age, gender).Contains(slot))
                return Refuse(400, "That document does not apply to this athlete for this tournament.");

            if (!http.HasFormContentType) return Refuse(400, "Send the document as a file upload.");
            var form = await http.ReadFormAsync(ct);
            var upload = form.Files.GetFile("file");
            if (upload is null) return Refuse(400, "No file was attached.");

            DateTime? documentDate = null;
            if (MedicalDocumentSlots.IsDated(slot))
            {
                if (!DateTime.TryParse(form["date"], System.Globalization.CultureInfo.InvariantCulture,
                        System.Globalization.DateTimeStyles.None, out var parsed))
                    return Refuse(400, "Enter the document date.");
                if (parsed.Date > DateTime.UtcNow.Date) return Refuse(400, "The document date cannot be in the future.");
                documentDate = parsed.Date;
            }

            var saved = await store.SaveAsync(upload, ct);
            if (!saved.Succeeded) return Refuse(400, EnglishOf(saved.Error));

            var file = await medical.GetOrCreateAsync(entry.AthleteRegistrationId, ct);
            try
            {
                var (result, done) = await medical.UploadByAdminAsync(
                    file, slot, saved.Attachment!.Id, documentDate, entry, actor, ct,
                    afterFinalApproval: access.AfterFinalApproval);
                if (!result.Ok)
                {
                    store.Delete(saved.Attachment.Id);
                    return Refuse(result.Status, result.MessageEn);
                }

                return Results.Ok(new
                {
                    replaced = done!.Replaced,
                    supersededPendingReplacement = done.SupersededPendingAttachmentId is not null,
                    medical = DescribeMedical(entry, file, store),
                });
            }
            catch
            {
                // Nothing was approved; do not leave the stored file behind.
                store.Delete(saved.Attachment.Id);
                throw;
            }
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDirector).DisableAntiforgery();

        // The examination desk corrects the health answers, medication details
        // and electronic declarations on the athlete's own Medical File.
        group.MapPut("/entries/{entryId:int}/medical/answers", async (
            int entryId, MedicalAnswersRequest request, ClaimsPrincipal user, SmfDbContext db,
            MedicalFileService medical, RegistrationAttachmentStore store, CancellationToken ct) =>
        {
            var entry = await LoadEntryAsync(entryId, db, ct);
            if (entry is null) return Results.NotFound();
            if (entry.Status == EntryStatuses.Withdrawn)
                return Refuse(409, "A withdrawn entry's medical file cannot be changed here.");
            var actor = AdminIdentity.Current(user);
            var access = await medical.AdminMayChangeAsync(entry.AthleteRegistrationId, entry.DivisionId, actor,
                mayBefore: actor.Has(AdminPermissions.TournamentTechnical), ct, entry);
            if (!access.Ok) return Refuse(access.Status, access.Message);

            var (age, gender) = AgeAndGender(entry);
            var file = await medical.GetOrCreateAsync(entry.AthleteRegistrationId, ct);
            var result = await medical.EditByTechnicalAsync(file,
                new MedicalFileService.TechnicalEdit(
                    request.HealthAnswers, request.Medications, request.Declarations, request.NotPregnantDeclared),
                age, gender, entry, actor, ct, afterFinalApproval: access.AfterFinalApproval);

            return result.Ok ? Results.Ok(DescribeMedical(entry, file, store)) : Refuse(result.Status, result.MessageEn);
        }).RequirePermission(AdminPermissions.TournamentTechnical, AdminPermissions.TournamentDirector);

        // The same CSV pattern as the membership register's export: a UTF-8
        // BOM for Excel, formula-safe fields, and an audit line.
        group.MapGet("/{id:int}/participants/export", async (
            int id, ClaimsPrincipal user, SmfDbContext db, AuditLogger audit, CancellationToken ct) =>
        {
            var tournament = await db.Tournaments.AsNoTracking().FirstOrDefaultAsync(t => t.Id == id, ct);
            if (tournament is null) return Results.NotFound();

            var (participants, _) = await LoadAsync(tournament, db, ct);
            var year = TournamentEligibility.TournamentYear(tournament);

            var csv = new StringBuilder();
            csv.AppendLine(string.Join(",", new[]
            {
                "Division", "Athlete", "Member ID", "Age", "Club / Training Center", "Coach", "Coach mobile",
                "Current weight (kg)", "Height (cm)", "Registration date", "Registered by", "Requirements status",
                "Missing requirements",
            }.Select(RegistrationExport.Escape)));

            foreach (var p in participants)
            {
                var age = CompetitionCategories.CompetitionAge(p.DateOfBirth, year);
                var missing = p.Medical.Missing(age, p.Gender);
                csv.AppendLine(string.Join(",", new[]
                {
                    DivisionHeading(p.Entry.Division),
                    p.NameEn ?? p.NameAr,
                    p.Entry.AthleteRegistration?.MembershipNumber,
                    age?.ToString(),
                    ClubOf(p.Entry),
                    p.Entry.CoachName,
                    p.Entry.CoachPhone,
                    p.Entry.DeclaredWeightKg?.ToString("0.##"),
                    p.Entry.HeightCm?.ToString("0.##"),
                    p.Entry.CreatedAt.ToString("yyyy-MM-dd"),
                    RegisteredBy(p.Entry),
                    missing.Count == 0 ? "Complete" : "Incomplete",
                    string.Join("; ", missing.Select(m => m.En)),
                }.Select(RegistrationExport.Escape)));
            }

            audit.Write(AdminIdentity.Current(user), AuditActions.Exported, "tournament", tournament.Id,
                details: $"Exported {participants.Count} tournament participant(s).");
            await db.SaveChangesAsync(ct);

            var bytes = new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes(csv.ToString())).ToArray();
            return Results.File(bytes, "text/csv; charset=utf-8",
                $"smf-participants-{tournament.Id}-{DateTime.UtcNow:yyyyMMdd-HHmm}.csv");
        }).RequirePermission(AdminPermissions.TournamentEntries, AdminPermissions.TournamentTechnical,
            AdminPermissions.TournamentManage, AdminPermissions.TournamentDraw);
    }

    internal static Task<TournamentEntry?> LoadEntryAsync(int entryId, SmfDbContext db, CancellationToken ct) =>
        db.TournamentEntries.AsNoTracking()
            .Include(e => e.Tournament)
            .Include(e => e.AthleteRegistration)
            .FirstOrDefaultAsync(e => e.Id == entryId, ct);

    /// <summary>The competition age for the entry's tournament, and the gender, from the athlete's record.</summary>
    private static (int? Age, string? Gender) AgeAndGender(TournamentEntry entry)
    {
        var athlete = entry.AthleteRegistration!;
        return (CompetitionCategories.CompetitionAge(TournamentEligibility.DateOfBirthOf(athlete),
                    TournamentEligibility.TournamentYear(entry.Tournament!)),
                TournamentEligibility.GenderOf(athlete));
    }

    private static readonly Dictionary<string, string> DocumentLabels = new()
    {
        [MedicalDocumentSlots.Certificate] = "Medical Certificate",
        [MedicalDocumentSlots.Screening] = "HIV / HBV / HCV Test",
        [MedicalDocumentSlots.GuardianConsent] = "Guardian Consent",
        [MedicalDocumentSlots.PregnancyDeclaration] = "Non-Pregnancy Declaration (signed)",
    };

    /// <summary>
    /// The Medical File as the technical team reads it for one entry: the
    /// documents that apply, each with its state, and the questions and
    /// declarations with their answers.
    /// </summary>
    internal static object DescribeMedical(TournamentEntry entry, AthleteMedicalFile file, RegistrationAttachmentStore store)
    {
        var (age, gender) = AgeAndGender(entry);
        var approvals = file.Approvals();
        var answers = file.Answers();
        var declared = file.Declared();
        var missing = file.Missing(age, gender);

        return new
        {
            entryId = entry.Id,
            competitionAge = age,
            gender,
            complete = missing.Count == 0,
            missing = missing.Select(m => m.En),
            documents = AthleteMedicalFile.DocumentsFor(age, gender).Select(slot =>
            {
                var attachment = file.AttachmentIn(slot);
                var stored = store.TryResolve(attachment, out _, out var meta);
                var on = !string.IsNullOrWhiteSpace(attachment);
                var approval = approvals.GetValueOrDefault(slot);
                return new
                {
                    key = slot,
                    label = DocumentLabels[slot],
                    status = !on ? "missing" : approval is not null ? "approved" : "uploaded",
                    dated = MedicalDocumentSlots.IsDated(slot),
                    // A date only belongs to a document on file: one stored
                    // without its file is not shown as if a document existed.
                    date = !on ? null
                         : slot == MedicalDocumentSlots.Certificate ? file.CertificateDate
                         : slot == MedicalDocumentSlots.Screening ? file.ScreeningDate : null,
                    // Only a stored file can be opened; an id without one (an
                    // older desk record) still counts as on file.
                    viewable = stored,
                    fileName = stored ? meta.FileName : null,
                    approvedAt = approval?.At,
                    approvedBy = approval?.By,
                    replacementPending = MedicalFileService.PendingFor(file, slot) is not null,
                };
            }),
            // Women of 18 and over declare by tick box: it is theirs to make.
            electronicPregnancyDeclaration = age is >= 18 && gender == "female"
                ? new { done = file.NotPregnantDeclared is true }
                : null,
            questions = HealthQuestions.All.Select(q => new
            {
                q.Key, label = q.En, q.AsksForDetail,
                answer = answers.TryGetValue(q.Key, out var value) ? value : (bool?)null,
            }),
            file.Medications,
            declarations = age is >= 18
                ? AthleteDeclarations.All.Select(d => new
                {
                    d.Key, label = d.En,
                    accepted = declared.TryGetValue(d.Key, out var yes) && yes,
                })
                : null,
        };
    }

    /* ── who may touch the Medical File through an entry ────────────────────
       The rule lives in MedicalFileService (AdminMayChangeAsync), shared with
       every other route that changes the file: before any active Final
       Approval the technical team; after one — in this tournament or another,
       the file being shared — only tournament.director; once a draw holding
       the athlete is published, nobody. The director may also read the file
       of an athlete who holds Final Approval. */

    private const string MedicalReadDenied =
        "Medical data needs the technical team permission, or the director's once the athlete is approved.";

    internal static async Task<bool> MayReadMedicalAsync(
        TournamentEntry entry, AdminIdentity.Actor actor, MedicalFileService medical, CancellationToken ct) =>
        actor.Has(AdminPermissions.TournamentTechnical)
        || (actor.Has(AdminPermissions.TournamentDirector)
            && (await medical.ApprovalLocksAsync(entry.AthleteRegistrationId, ct)).Count > 0);

    internal static IResult Refuse(int status, string? message) =>
        Results.Json(new { message, messageEn = message }, statusCode: status);

    /// <summary>The store's messages are "Arabic / English"; the console is English only.</summary>
    private static string? EnglishOf(string? message) =>
        message?.Split(" / ", 2) is [_, var en] ? en : message;

    internal sealed record Participant(
        TournamentEntry Entry, AthleteMedicalFile Medical,
        string? NameAr, string? NameEn, DateTime? DateOfBirth, string? Gender);

    /// <summary>
    /// The tournament's live entries — a withdrawn athlete is no longer
    /// registered — in division order: Female before Male, categories in the
    /// official order, weights lightest first, as the tournament set-up lists
    /// them. Entries without a division come last.
    /// </summary>
    internal static async Task<(List<Participant>, List<TournamentDivision>)> LoadAsync(
        Tournament tournament, SmfDbContext db, CancellationToken ct)
    {
        var entries = await db.TournamentEntries.AsNoTracking()
            .Include(e => e.AthleteRegistration)
            .Include(e => e.Division)
            .Where(e => e.TournamentId == tournament.Id && e.Status != EntryStatuses.Withdrawn)
            .ToListAsync(ct);

        var athleteIds = entries.Select(e => e.AthleteRegistrationId).ToList();
        var files = await db.AthleteMedicalFiles.AsNoTracking()
            .Where(f => athleteIds.Contains(f.AthleteRegistrationId))
            .ToListAsync(ct);

        var divisions = await db.TournamentDivisions.AsNoTracking()
            .Where(d => d.TournamentId == tournament.Id)
            .ToListAsync(ct);

        var participants = entries.Select(e =>
        {
            string? nameAr = null, nameEn = null;
            if (e.AthleteRegistration is { } athlete)
            {
                try
                {
                    var payload = JsonDocument.Parse(athlete.PayloadJson).RootElement;
                    nameAr = RegistrationPayload.DisplayName(payload, true);
                    nameEn = RegistrationPayload.DisplayName(payload, false);
                }
                catch (JsonException)
                {
                    // A malformed payload costs the row its name, not the page.
                }
            }

            // No file at all is missing everything, not nothing.
            var file = files.FirstOrDefault(f => f.AthleteRegistrationId == e.AthleteRegistrationId)
                       ?? new AthleteMedicalFile();

            return new Participant(e, file, nameAr, nameEn,
                e.AthleteRegistration is null ? null : TournamentEligibility.DateOfBirthOf(e.AthleteRegistration),
                e.AthleteRegistration is null ? null : TournamentEligibility.GenderOf(e.AthleteRegistration));
        })
        .OrderBy(p => p.Entry.Division is null ? 1 : 0)
        .ThenBy(p => p.Entry.Division?.Gender == "female" ? 0 : 1)
        .ThenBy(p => CompetitionCategories.OrderOf(p.Entry.Division?.Category))
        .ThenBy(p => p.Entry.Division?.SortWeight)
        .ThenBy(p => p.NameEn ?? p.NameAr, StringComparer.OrdinalIgnoreCase)
        .ToList();

        return (participants, divisions);
    }

    private static object Describe(Participant p, List<TournamentDivision> divisions, Tournament tournament, bool medicalLocked)
    {
        var e = p.Entry;
        var year = TournamentEligibility.TournamentYear(tournament);
        var age = CompetitionCategories.CompetitionAge(p.DateOfBirth, year);
        var missing = p.Medical.Missing(age, p.Gender);
        var answers = p.Medical.Answers();
        var declared = p.Medical.Declared();

        return new
        {
            e.Id,
            e.AthleteRegistrationId,
            nameAr = p.NameAr,
            nameEn = p.NameEn,
            membershipNumber = e.AthleteRegistration?.MembershipNumber,
            reference = e.AthleteRegistration?.ReferenceNumber,
            gender = p.Gender,
            competitionAge = age,
            e.Status,
            division = e.Division is { } d
                ? new
                {
                    d.Id, d.Gender, d.Category, d.WeightLimitKg, d.WeightFloorKg,
                    heading = DivisionHeading(d),
                    weightLabel = d.WeightLabel(false),
                }
                : null,
            // A class or category change would clear a weigh-in result or Final
            // Draw Approval given for the class it is in now, and needs a reason.
            classChangeClearsReadiness = TournamentEntryService.ClassChangeClears(e),
            category = e.Category,
            categoryLabel = CompetitionCategories.Label(e.Category).En,
            club = ClubOf(e),
            e.CoachName,
            e.CoachPhone,
            e.DeclaredWeightKg,
            e.HeightCm,
            registeredAt = e.CreatedAt,
            e.EnteredBy,
            e.EnteredByName,
            registeredBy = RegisteredBy(e),
            medicalLocked,
            requirementsComplete = missing.Count == 0,
            missing = missing.Select(m => m.En),
            // Only what applies to this athlete at this tournament (REQ-04):
            // the same rules as Missing, item by item.
            requirements = Requirements(p.Medical, age, p.Gender),
            healthQuestions = new
            {
                answered = HealthQuestions.All.Count(q => answers.ContainsKey(q.Key)),
                total = HealthQuestions.All.Count,
            },
            declarations = age is >= 18
                ? new
                {
                    accepted = AthleteDeclarations.All.Count(x => declared.TryGetValue(x.Key, out var yes) && yes),
                    total = AthleteDeclarations.All.Count,
                }
                : null,
            editOptions = EditOptions(p, divisions, year),
        };
    }

    /// <summary>The documents and declarations that apply, each with whether it is done.</summary>
    internal static IEnumerable<object> Requirements(AthleteMedicalFile file, int? age, string? gender)
    {
        var approvals = file.Approvals();
        foreach (var slot in AthleteMedicalFile.DocumentsFor(age, gender))
        {
            var on = !string.IsNullOrWhiteSpace(file.AttachmentIn(slot));
            yield return new
            {
                key = slot, label = DocumentLabels[slot], done = on,
                status = !on ? "missing" : approvals.ContainsKey(slot) ? "approved" : "uploaded",
            };
        }

        // An adult woman's declaration is a tick box, not a document.
        if (age is >= 18 && gender == "female")
        {
            var done = file.NotPregnantDeclared is true;
            yield return new
            {
                key = "pregnancy", label = "Non-Pregnancy Declaration", done,
                status = done ? "declared" : "missing",
            };
        }
    }

    /// <summary>
    /// The categories the admin may move this entry to — those the athlete's
    /// competition age admits that the tournament runs for their gender — each
    /// with its official weight classes in the tournament, lightest first. The
    /// server checks the choice again; this only shapes the form.
    /// </summary>
    private static IEnumerable<object> EditOptions(Participant p, List<TournamentDivision> divisions, int year) =>
        CompetitionCategories.EligibleForTournament(p.DateOfBirth, year)
            .Select(c => new
            {
                value = c.Value,
                label = c.En,
                weightClasses = divisions
                    .Where(d => d.Category == c.Value && d.Gender == p.Gender
                                && WeightClasses.IsOfficial(d.Category, d.Gender, d.WeightLimitKg, d.WeightFloorKg))
                    .OrderBy(d => d.SortWeight)
                    .Select(d => new { divisionId = d.Id, label = d.WeightLabel(false) })
                    .ToList(),
            })
            .Where(c => c.weightClasses.Count > 0);

    /// <summary>"Female / U24 / 48 KG".</summary>
    internal static string DivisionHeading(TournamentDivision? d) => d is null
        ? "No weight class"
        : $"{(d.Gender == "female" ? "Female" : "Male")} / {CompetitionCategories.Label(d.Category).En} / "
          + d.WeightLabel(false).Replace("kg", "KG");

    // One rule for the club identity everywhere (DRW-007): see DrawClub.
    internal static string? ClubOf(TournamentEntry e) => DrawClub.Of(e);

    private static string RegisteredBy(TournamentEntry e)
    {
        var who = e.EnteredBy switch
        {
            EntrySources.Athlete => "Athlete",
            EntrySources.Club => "Club",
            EntrySources.Coach => "Coach",
            EntrySources.Admin => "Admin",
            _ => e.EnteredBy,
        };
        return string.IsNullOrWhiteSpace(e.EnteredByName) ? who : $"{who} — {e.EnteredByName}";
    }
}

/// <param name="Reason">Required when the change clears a weigh-in result or Final Draw Approval.</param>
public record ParticipantCategoryRequest(string? Category, int? DivisionId, string? Reason = null);

public record MedicalAnswersRequest(
    Dictionary<string, bool?>? HealthAnswers,
    string? Medications,
    Dictionary<string, bool>? Declarations,
    bool? NotPregnantDeclared);
