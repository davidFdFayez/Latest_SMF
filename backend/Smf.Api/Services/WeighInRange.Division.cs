using Smf.Api.Data.Models;

namespace Smf.Api.Services;

public sealed partial record WeighInRange
{
    /// <summary>The accepted weigh-in range for a division, or not configured when there is none.</summary>
    public static WeighInRange For(TournamentDivision? division) => division is null
        ? NotConfigured("The athlete has no registered weight class.")
        : For(division.Category, division.Gender, division.WeightLimitKg, division.WeightFloorKg);
}
