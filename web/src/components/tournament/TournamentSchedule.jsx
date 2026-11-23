import {
  IconCalendar, IconClipboardMedical, IconClock, IconFlag, IconLaptop, IconTrophy,
} from '../icons/Icons';

const ICONS = { laptop: IconLaptop, medical: IconClipboardMedical, flag: IconFlag, trophy: IconTrophy };

/**
 * Schedule: the tournament's five milestones as a vertical timeline — a
 * marker on the reading side (right in Arabic, left in English), the day
 * beside it, then what happens. `rows` come from buildSchedule
 * (schedule.js), already in order; the marker of the milestone under way —
 * or next to come — is filled. No status labels are shown.
 */
export default function TournamentSchedule({ rows, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);

  return (
    <section className="tsection tsched" aria-labelledby="tsched-title">
      <h2 id="tsched-title" className="tsection__title">{pick('الجدول الزمني', 'Schedule')}</h2>
      <ol className="tpage-card tsched__card">
        {rows.map((row) => {
          const Icon = ICONS[row.icon];
          return (
            <li
              key={row.key}
              className={`tsched__row${row.current ? ' is-current' : ''}${row.status ? ` is-${row.status}` : ''}`}
              aria-current={row.current ? 'step' : undefined}
            >
              <span className="tsched__marker" aria-hidden="true" />

              <div className="tsched__day">
                <IconCalendar className="tsched__day-icon" aria-hidden="true" />
                {row.day ? (
                  <span className="tsched__day-text">
                    <strong>{row.day.weekday}</strong>
                    <bdi>{row.day.date}</bdi>
                  </span>
                ) : (
                  <span className="tsched__day-text tsched__day-text--tba">
                    <strong>{pick('سيُعلن لاحقاً', 'To be announced')}</strong>
                  </span>
                )}
              </div>

              <div className="tsched__info">
                <Icon className="tsched__info-icon" aria-hidden="true" />
                <div className="tsched__info-text">
                  {/* The time sits beside the title, so every row keeps the same two lines. */}
                  <span className="tsched__head">
                    <strong className="tsched__name">{row.title}</strong>
                    {row.time && (
                      <span className="tsched__time">
                        <IconClock className="tsched__time-icon" aria-hidden="true" />
                        <bdi>{row.time}</bdi>
                      </span>
                    )}
                  </span>
                  <span className="tsched__desc">{row.description}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
