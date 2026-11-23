import { IconClock } from '../icons/Icons';

/**
 * Key Dates: the tournament's milestones as connected arrows, in the order given,
 * starting on the reading side (right in Arabic, left in English). Only
 * milestones the tournament actually has are passed in; the one the
 * tournament is in now — or, before anything has started, the first — is
 * filled. On a narrow screen the arrows stack and point down.
 *
 * Each milestone's lines are { prefix?, date, time? }: the date, then a small
 * clock and the time. Date and time are each isolated (<bdi>) so neither is
 * reordered by the text around it.
 */
export default function TournamentKeyDates({ milestones, ar }) {
  if (!milestones.length) return null;

  const now = Date.now();
  const started = milestones.filter((m) => new Date(m.at).getTime() <= now);
  const current = started.length ? started[started.length - 1].key : milestones[0].key;

  return (
    <section className="tpage-dates" aria-labelledby="tpage-dates-title">
      <h2 id="tpage-dates-title" className="tsection__title">{ar ? 'أبرز المواعيد' : 'Key Dates'}</h2>
      <ol className="tpage-dates__list">
        {milestones.map((m, index) => (
          <li
            key={m.key}
            className={`tpage-dates__step tpage-dates__step--${m.key}${m.key === current ? ' is-current' : ''}${index === 0 ? ' is-first' : ''}`}
            aria-current={m.key === current ? 'step' : undefined}
          >
            <div className="tpage-dates__inner">
              <strong className="tpage-dates__name">{m.label}</strong>
              {m.lines.map((line, index) => (
                <span className="tpage-dates__when" key={index}>
                  {line.prefix && <span className="tpage-dates__prefix">{line.prefix}</span>}
                  <bdi>{line.date}</bdi>
                  {line.time && (
                    <span className="tpage-dates__time">
                      <IconClock className="tpage-dates__clock" aria-hidden="true" />
                      <bdi>{line.time}</bdi>
                    </span>
                  )}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
