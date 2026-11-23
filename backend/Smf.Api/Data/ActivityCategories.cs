namespace Smf.Api.Data;

/// <summary>
/// The website's Activities categories — the values <see cref="Models.EventItem.Category"/>
/// stores and the public Activities filters select on.
///
/// A tournament names one of these as where it is shown once published, so
/// it sits in the same filter as the events beside it. The keys are the ones
/// the site already uses; they are what is stored and must not change.
/// </summary>
public static class ActivityCategories
{
    public const string Community = "community";
    public const string Regional = "regional";
    public const string International = "international";
    public const string Camp = "camp";
    public const string Workshop = "workshop";

    public static readonly IReadOnlyList<(string Value, string Ar, string En)> All =
    [
        (Community, "فعاليات مجتمعية", "Community Events"),
        (Regional, "بطولات داخلية", "Regional Championships"),
        (International, "بطولات دولية", "International Championships"),
        (Camp, "معسكرات تدريبية", "Training Camps"),
        (Workshop, "تدريب", "Training"),
    ];

    public static bool IsKnown(string? value) => All.Any(entry => entry.Value == value);
}
