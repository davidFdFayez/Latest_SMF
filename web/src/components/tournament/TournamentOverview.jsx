import { useEffect, useRef, useState } from 'react';
import { IconAward, IconCalendar, IconClock, IconLocation, IconSwords } from '../icons/Icons';

/**
 * Overview: the section heading "About the Tournament" above the description
 * card, with the Tournament Information panel beside it. The
 * description scrolls inside its own box once it is longer than the box, with
 * a visible scrollbar and a fade at the edge while more text lies below.
 */
export default function TournamentOverview({ description, facts, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  return (
    <section className="tsection" aria-labelledby="tpage-about-title">
      <h2 id="tpage-about-title" className="tsection__title">{pick('عن البطولة', 'About the Tournament')}</h2>
      <div className="tpage-overview">
      <div className="tpage-card tpage-about">
        {description ? (
          <ScrollingText label={pick('وصف البطولة', 'Tournament description')}>
            <RichText text={description} />
          </ScrollingText>
        ) : (
          <p className="tpage-about__empty">{pick('لا يوجد وصف لهذه البطولة بعد.', 'No description has been added yet.')}</p>
        )}
      </div>

      {facts.length > 0 && (
        <aside className="tpage-card tpage-info" aria-labelledby="tpage-info-title">
          <h2 id="tpage-info-title" className="tpage-card__title tpage-card__title--small">
            {pick('معلومات البطولة', 'Tournament Information')}
          </h2>
          <dl className="tpage-info__list">
            {facts.map(({ key, label, value }) => {
              const Icon = FACT_ICONS[key];
              return (
                <div className="tpage-info__item" key={key}>
                  {Icon && <Icon className="tpage-info__icon" aria-hidden="true" />}
                  <div>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                </div>
              );
            })}
          </dl>
        </aside>
      )}
      </div>
    </section>
  );
}

const FACT_ICONS = {
  type: IconAward,
  competition: IconSwords,
  date: IconCalendar,
  location: IconLocation,
  time: IconClock,
};

/**
 * A box that scrolls its own content once that is taller than the box. It is
 * focusable (so the keyboard can scroll it) only when it actually scrolls, and
 * shows a fade at the bottom while there is more below.
 */
function ScrollingText({ label, children }) {
  const ref = useRef(null);
  const [state, setState] = useState({ scrolls: false, more: false });

  useEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const measure = () => {
      const scrolls = box.scrollHeight > box.clientHeight + 1;
      const more = scrolls && box.scrollTop + box.clientHeight < box.scrollHeight - 4;
      setState((prev) => (prev.scrolls === scrolls && prev.more === more ? prev : { scrolls, more }));
    };
    measure();
    box.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(box);
    if (box.firstElementChild) observer?.observe(box.firstElementChild);
    return () => {
      box.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, []);

  return (
    <div className={`tpage-about__frame${state.more ? ' has-more' : ''}`}>
      <div
        ref={ref}
        className={`tpage-about__scroll${state.scrolls ? ' is-scrolling' : ''}`}
        tabIndex={state.scrolls ? 0 : undefined}
        role={state.scrolls ? 'region' : undefined}
        aria-label={state.scrolls ? label : undefined}
      >
        <div className="tpage-about__text">{children}</div>
      </div>
    </div>
  );
}

/**
 * The description as written: blank lines separate paragraphs, single line
 * breaks stay, and lines starting with "-", "•" or "1." become lists. Plain
 * text only — nothing in it is treated as markup.
 */
function RichText({ text }) {
  const blocks = String(text).replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  return blocks.map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length && lines.every((line) => /^[-•*]\s+/.test(line))) {
      return (
        <ul key={index}>
          {lines.map((line, i) => <li key={i}>{line.replace(/^[-•*]\s+/, '')}</li>)}
        </ul>
      );
    }
    if (lines.length && lines.every((line) => /^\d+[.)]\s+/.test(line))) {
      return (
        <ol key={index}>
          {lines.map((line, i) => <li key={i}>{line.replace(/^\d+[.)]\s+/, '')}</li>)}
        </ol>
      );
    }
    return (
      <p key={index}>
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {line}
          </span>
        ))}
      </p>
    );
  });
}
