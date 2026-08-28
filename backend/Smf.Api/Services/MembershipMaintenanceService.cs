using Smf.Api.Data;

namespace Smf.Api.Services;

/// <summary>
/// Runs the membership lifecycle's time-based rules.
///
/// §1 and §6 describe a membership that expires after three years and a
/// completion window that runs out after seven working days, but nothing in an
/// HTTP API notices time passing. Without this, a term could lapse and the
/// member would never be told, and the "expire lapsed" endpoint would only ever
/// run if somebody happened to press a button.
///
/// Each pass, in order:
///   1. warns members whose term is approaching its end (§6 — تجديد);
///   2. retires memberships whose term has elapsed (§6 — انتهاء);
///   3. chases applicants who still owe missing items (§6 — طلب استكمال).
///
/// The warning runs before the expiry sweep so a membership crossing its expiry
/// between two passes is still warned before it is retired.
///
/// Failures are logged and the loop continues: a maintenance pass must never
/// take the API down with it.
/// </summary>
public class MembershipMaintenanceService(
    IServiceProvider services,
    IConfiguration configuration,
    ILogger<MembershipMaintenanceService> logger) : BackgroundService
{
    /// <summary>
    /// How often to sweep. The work is date-based, so running more than daily
    /// changes nothing; the default is deliberately conservative.
    /// </summary>
    private TimeSpan Interval =>
        int.TryParse(configuration["Membership:MaintenanceIntervalHours"], out var hours) && hours > 0
            ? TimeSpan.FromHours(hours)
            : TimeSpan.FromHours(12);

    /// <summary>How far ahead of expiry to warn. Roughly two months by default.</summary>
    private int RenewalWarningDays =>
        int.TryParse(configuration["Membership:RenewalWarningDays"], out var days) && days > 0
            ? days
            : 60;

    /// <summary>
    /// Set <c>Membership:MaintenanceEnabled=false</c> to hold the sweep off —
    /// useful on a shared test database where nobody wants generated email.
    /// </summary>
    private bool Enabled =>
        !bool.TryParse(configuration["Membership:MaintenanceEnabled"], out var enabled) || enabled;

    /// <summary>The sweep acts on the system's behalf, not a signed-in person.</summary>
    private static readonly AdminIdentity.Actor System =
        new(null, "system", AdminRoles.SuperAdmin, MembershipRoles.FinalApprover);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!Enabled)
        {
            logger.LogInformation("Membership maintenance is disabled by configuration.");
            return;
        }

        // Let the application finish starting — and the schema guard finish
        // reconciling — before touching the database.
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Membership maintenance pass failed; will retry next interval.");
            }

            try
            {
                await Task.Delay(Interval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    /// <summary>One maintenance pass. Public so it can be triggered on demand.</summary>
    public async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        // BackgroundService is a singleton; the services it uses are scoped.
        using var scope = services.CreateScope();
        var memberships = scope.ServiceProvider.GetRequiredService<MembershipService>();

        var warned = await memberships.SendRenewalRemindersAsync(RenewalWarningDays, cancellationToken);
        var expired = await memberships.ExpireLapsedAsync(System, cancellationToken);
        var chased = await memberships.SendCompletionRemindersAsync(cancellationToken);

        if (warned + expired + chased > 0)
        {
            logger.LogInformation(
                "Membership maintenance: {Warned} renewal warning(s), {Expired} expired, {Chased} completion reminder(s).",
                warned, expired, chased);
        }
    }
}
