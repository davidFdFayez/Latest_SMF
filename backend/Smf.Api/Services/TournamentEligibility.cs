using System.Text.Json;
using Smf.Api.Data;
using Smf.Api.Data.Models;

namespace Smf.Api.Services;

/// <summary>
/// Whether an athlete may enter a tournament, and in what — Phase 3 REQ-02 and
/// REQ-03.
///
/// The document is emphatic that the system shows an athlete only what they are
/// eligible for (REQ-03 rules 4 and 5, acceptance criterion T02). This is the
/// one place that decides, so the entry form, the club's list, the coach's list
/// and the API all give the same answer.
///
/// Three things can stop an athlete outright:
/// <list type="bullet">
/// <item>No active annual membership (rule 2).</item>
/// <item>An active medical suspension after a KO or RSC-H (rule 3).</item>
/// <item>No category in the tournament that their age admits (rule 4).</item>
/// </list>
/// </summary>
public static class TournamentEligibility
{
    /// <summary>Why an athlete cannot enter, in both languages.</summary>
    public sealed record Barrier(string Code, string Ar, string En);

    /// <summary>A category the athlete may enter, and the weight classes within it.</summary>
    public sealed record Option(
        string Category,
        string CategoryAr,
        string CategoryEn,
        string Track,
        IReadOnlyList<DivisionOption> Divisions);

    public sealed record DivisionOption(
        int DivisionId,
        decimal? WeightLimitKg,
        decimal? WeightFloorKg,
        string LabelAr,
        string LabelEn);

    /// <summary>What the athlete may do here.</summary>
    public sealed record Verdict(
        bool CanEnter,
        IReadOnlyList<Barrier> Barriers,
        IReadOnlyList<string> Tracks,
        IReadOnlyList<Option> Options,
        bool AlreadyEntered)
    {
        /// <summary>
        /// REQ-02 rule 4 — more than one track open means the athlete has to
        /// choose, and the form has to ask rather than decide for them.
        /// </summary>
        public bool MustChooseTrack => Tracks.Count > 1;
    }

    /// <summary>
    /// Works out where this athlete stands against this tournament.
    /// </summary>
    /// <param name="divisions">Every division the tournament runs.</param>
    /// <param name="suspensions">The athlete's suspensions; only active ones matter.</param>
    /// <param name="alreadyEntered">True when they already hold an entry here (REQ-03 rule 12).</param>
    public static Verdict Assess(
        Tournament tournament,
        Registration athlete,
        IReadOnlyList<TournamentDivision> divisions,
        IReadOnlyList<MedicalSuspension> suspensions,
        bool alreadyEntered,
        DateTime asOf)
    {
        var barriers = new List<Barrier>();

        /* ── membership (rule 2) ─────────────────────────────────────────── */
        if (athlete.Type != "athlete")
        {
            barriers.Add(new Barrier("not_an_athlete",
                "هذا السجل ليس عضوية لاعب.",
                "This record is not an athlete membership."));
        }

        if (athlete.Status != RegistrationStatuses.Approved || athlete.IsExpired(asOf))
        {
            barriers.Add(new Barrier("membership_inactive",
                "يشترط أن تكون العضوية السنوية معتمدة وفعالة.",
                "An approved, active annual membership is required."));
        }

        /* ── medical suspension (rule 3) ─────────────────────────────────── */
        var active = suspensions.FirstOrDefault(s => s.IsActive(asOf));
        if (active is not null)
        {
            var until = active.EndsOn is { } ends
                ? ends.ToString("yyyy-MM-dd")
                : null;

            barriers.Add(new Barrier("medical_suspension",
                until is null
                    ? "على اللاعب إيقاف طبي فعّال؛ يمنع التسجيل حتى انتهاء الإيقاف."
                    : $"على اللاعب إيقاف طبي فعّال حتى {until}؛ يمنع التسجيل حتى انتهاء الإيقاف.",
                until is null
                    ? "This athlete has an active medical suspension; entry is blocked until it ends."
                    : $"This athlete is medically suspended until {until}; entry is blocked until it ends."));
        }

        /* ── entries open at all ─────────────────────────────────────────── */
        if (!tournament.IsRegistrationOpen(asOf))
        {
            barriers.Add(new Barrier("registration_closed",
                "التسجيل في هذه البطولة غير متاح حاليًا.",
                "Entries for this tournament are not open."));
        }

        if (alreadyEntered)
        {
            barriers.Add(new Barrier("already_entered",
                "اللاعب مسجل بالفعل في هذه البطولة.",
                "This athlete is already entered in this tournament."));
        }

        /* ── age (rules 4 and 5) ─────────────────────────────────────────── */
        var dateOfBirth = DateOfBirthOf(athlete);
        var year = tournament.StartDate.Year;
        var eligible = CompetitionCategories.EligibleFor(dateOfBirth, year);
        var gender = GenderOf(athlete);

        // Only the categories this tournament actually runs, in this athlete's
        // gender, that their age admits.
        var running = divisions
            .Where(d => gender is null || d.Gender == gender)
            .Where(d => eligible.Any(c => c.Value == d.Category))
            .ToList();

        if (dateOfBirth is null)
        {
            barriers.Add(new Barrier("no_date_of_birth",
                "لا يوجد تاريخ ميلاد في ملف اللاعب.",
                "This athlete has no date of birth on file."));
        }
        else if (running.Count == 0)
        {
            barriers.Add(new Barrier("no_eligible_category",
                "لا توجد فئة في هذه البطولة تناسب عمر اللاعب وجنسه.",
                "No category in this tournament matches this athlete's age and gender."));
        }

        var options = running
            .GroupBy(d => d.Category)
            .Select(group =>
            {
                var (ar, en) = CompetitionCategories.Label(group.Key);
                return new Option(
                    group.Key,
                    ar,
                    en,
                    CompetitionCategories.TrackOf(group.Key) ?? string.Empty,
                    group.OrderBy(d => d.SortWeight)
                        .Select(d => new DivisionOption(
                            d.Id,
                            d.WeightLimitKg,
                            d.WeightFloorKg,
                            d.Describe(arabic: true),
                            d.Describe(arabic: false)))
                        .ToList());
            })
            .OrderBy(o => o.Track)
            .ThenBy(o => o.CategoryEn, StringComparer.Ordinal)
            .ToList();

        var tracks = options.Select(o => o.Track).Distinct().ToList();

        return new Verdict(barriers.Count == 0, barriers, tracks, options, alreadyEntered);
    }

    /// <summary>The date of birth out of the stored membership payload.</summary>
    public static DateTime? DateOfBirthOf(Registration athlete)
    {
        try
        {
            var payload = JsonDocument.Parse(athlete.PayloadJson).RootElement;
            var text = RegistrationPayload.FirstString(payload, "dateOfBirth");
            return DateTime.TryParse(text, out var parsed) ? parsed : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary><c>male</c>, <c>female</c>, or null when the record does not say.</summary>
    public static string? GenderOf(Registration athlete)
    {
        try
        {
            var payload = JsonDocument.Parse(athlete.PayloadJson).RootElement;
            return RegistrationPayload.FirstString(payload, "gender");
        }
        catch (JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// The divisions a tournament should have, from the categories, genders
    /// and weight classes chosen when it was set up (REQ-01 rules 4 to 6).
    /// </summary>
    public static IReadOnlyList<(string Category, string Gender, decimal? Limit, decimal? Floor)> Plan(
        IReadOnlyList<string> categories,
        IReadOnlyList<string> genders,
        Func<string, string, IReadOnlyList<WeightClasses.WeightClass>> weightClasses)
    {
        var plan = new List<(string, string, decimal?, decimal?)>();

        foreach (var category in categories.Distinct())
        {
            foreach (var gender in genders.Distinct())
            {
                foreach (var weight in weightClasses(category, gender))
                {
                    plan.Add((category, gender, weight.LimitKg, weight.FloorKg));
                }
            }
        }

        return plan;
    }
}
