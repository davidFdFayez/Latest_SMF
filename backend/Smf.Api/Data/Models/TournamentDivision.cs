namespace Smf.Api.Data.Models;

/// <summary>
/// A division — Phase 3 REQ-02 rule 5: <b>age category + gender + weight
/// class</b>.
///
/// This is the unit everything downstream works in. A draw is made for one
/// division, a schedule groups bouts by it, and an athlete may enter exactly
/// one of them per tournament (REQ-03 rule 12).
/// </summary>
public class TournamentDivision
{
    public int Id { get; set; }

    public int TournamentId { get; set; }
    public Tournament? Tournament { get; set; }

    /// <summary>A value from <see cref="CompetitionCategories"/> — u8 … masters_45.</summary>
    public string Category { get; set; } = string.Empty;

    /// <summary><c>male</c> or <c>female</c>.</summary>
    public string Gender { get; set; } = string.Empty;

    /// <summary>
    /// The upper limit of the weight class in kilograms. The open class at the
    /// top of a category has no upper limit, which is <see cref="IsOpenClass"/>.
    /// </summary>
    public decimal? WeightLimitKg { get; set; }

    /// <summary>The lower bound, so a class reads as a range rather than a ceiling.</summary>
    public decimal? WeightFloorKg { get; set; }

    /// <summary>True for the "+" class at the top, which has a floor and no ceiling.</summary>
    public bool IsOpenClass => WeightLimitKg is null;

    /// <summary>
    /// Set once the draw for this division has been published (REQ-10).
    /// Scheduling only offers divisions that have reached this point.
    /// </summary>
    public DateTime? DrawPublishedAt { get; set; }

    /// <summary>
    /// Stage 5 Division Schedule: when an administrator last explicitly saved
    /// this division's complete schedule (Save Division Schedule), by whom and
    /// at which schedule revision. A division is "Scheduled" only with this set
    /// AND every bout to fight holding a valid saved slot — a published
    /// bracket, opening a page or automatically initialised data never set it.
    /// Existing databases receive these columns empty and are backfilled once
    /// from explicit assignment history (see SeedData.BackfillDivisionScheduleSaves).
    /// </summary>
    public DateTime? ScheduleSavedAt { get; set; }
    public string? ScheduleSavedBy { get; set; }
    public int? ScheduleSavedRevision { get; set; }

    /// <summary>
    /// Where the saved marker came from: <c>division_page</c> — an administrator
    /// saved the division on the Division Schedule page (the ONLY source that
    /// makes a division "Scheduled"); <c>migration</c> — the Step 2 one-time
    /// conversion inferred it from old assignment history. Migration markers are
    /// kept for the audit trail but never count as a save.
    /// </summary>
    public string? ScheduleSavedSource { get; set; }

    public ICollection<TournamentEntry> Entries { get; set; } = [];
    public ICollection<Bout> Bouts { get; set; } = [];

    /// <summary>
    /// Scheduling settings, which REQ-11 rule 5 sets at division level and
    /// applies to every bout under it. A bout may still be moved to another
    /// ring on its own (rule 7).
    /// </summary>
    public int? DefaultRingId { get; set; }
    public TimeSpan? FirstBoutTime { get; set; }

    /// <summary>Minutes between the start of one bout and the next (REQ-11 rule 5).</summary>
    public int? BoutIntervalMinutes { get; set; }

    /// <summary>The day of the tournament this division runs on (REQ-11 rule 4).</summary>
    public DateTime? ScheduledDate { get; set; }

    /// <summary>
    /// How a division reads: "Male – U18 – 45 kg", exactly as REQ-11's own
    /// example writes it.
    /// </summary>
    public string Describe(bool arabic)
    {
        var (categoryAr, categoryEn) = CompetitionCategories.Label(Category);
        var gender = arabic
            ? (Gender == "female" ? "إناث" : "ذكور")
            : (Gender == "female" ? "Female" : "Male");

        var weight = WeightLabel(arabic);

        return arabic
            ? $"{gender} – {categoryAr} – {weight}"
            : $"{gender} – {categoryEn} – {weight}";
    }

    /// <summary>The weight class alone, e.g. "45 kg", or "+91 kg" for the open class.</summary>
    public string WeightLabel(bool arabic) => IsOpenClass
        ? $"+{WeightFloorKg:0.##} {(arabic ? "كجم" : "kg")}"
        : $"{WeightLimitKg:0.##} {(arabic ? "كجم" : "kg")}";

    /// <summary>Sort key for a schedule: lightest class first (REQ-11 rule 2).</summary>
    public decimal SortWeight => WeightLimitKg ?? (WeightFloorKg ?? 0) + 1000m;
}
