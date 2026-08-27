namespace Smf.Api.Services;

/// <summary>
/// مهلة استكمال الطلب الناقص — "7 أيام عمل قابلة للتعديل" (§6, قواعد تشغيلية مشتركة).
///
/// The federation stated the deadline in <em>working</em> days, so counting
/// calendar days would shorten every deadline that spans a weekend. The Saudi
/// working week runs Sunday to Thursday, making Friday and Saturday the
/// weekend — not the Saturday/Sunday that <see cref="DayOfWeek"/> ordering
/// might suggest.
///
/// Public holidays are not modelled: they move with the Hijri calendar and the
/// federation has not supplied a list. The effect is that a deadline falling
/// across Eid is slightly tighter than intended, which is why §6 marks the
/// figure "قابلة للتعديل" and the reviewer can always extend it.
/// </summary>
public static class WorkingDays
{
    public static bool IsWeekend(DateTime date) =>
        date.DayOfWeek is DayOfWeek.Friday or DayOfWeek.Saturday;

    public static bool IsWorkingDay(DateTime date) => !IsWeekend(date);

    /// <summary>
    /// The instant <paramref name="count"/> working days after
    /// <paramref name="from"/>, preserving the time of day.
    /// </summary>
    public static DateTime Add(DateTime from, int count)
    {
        if (count <= 0) return from;

        var date = from;
        var remaining = count;

        while (remaining > 0)
        {
            date = date.AddDays(1);
            if (IsWorkingDay(date)) remaining--;
        }

        return date;
    }

    /// <summary>
    /// Working days between two instants, not counting the start day itself.
    /// Negative when <paramref name="to"/> precedes <paramref name="from"/>,
    /// which is how an overdue request reports how far past its deadline it is.
    /// </summary>
    public static int Between(DateTime from, DateTime to)
    {
        if (to < from) return -Between(to, from);

        var days = 0;
        for (var date = from.Date.AddDays(1); date <= to.Date; date = date.AddDays(1))
            if (IsWorkingDay(date)) days++;

        return days;
    }

    /// <summary>
    /// The deadline for a completion request raised at <paramref name="raisedAt"/>.
    /// </summary>
    public static DateTime CompletionDeadline(DateTime raisedAt, int workingDays) =>
        Add(raisedAt, workingDays);
}
