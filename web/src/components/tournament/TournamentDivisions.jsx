import { useLayoutEffect, useRef, useState } from 'react';
import { IconChevron, IconFemale, IconMale, IconUsers } from '../icons/Icons';
import { toLatinDigits } from '../../utils/format';

/**
 * Divisions & Weights: one gender at a time (Male or Female — no "All"),
 * then a compact row per division with its weight classes as pills.
 *
 * `divisions` are the tournament's configured divisions, already in order
 * (Masters, Elite, then youth from youngest to oldest), each
 * { key, gender: 'male' | 'female', name, weights: ['45', '63.5', '+81', …] }.
 * Nothing here is invented: the rows and pills are exactly what is passed in.
 */
export default function TournamentDivisions({ divisions, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const hasMale = divisions.some((d) => d.gender === 'male');
  const [gender, setGender] = useState(hasMale || !divisions.length ? 'male' : 'female');
  const shown = divisions.filter((d) => d.gender === gender);

  const options = [
    { key: 'male', label: pick('ذكور', 'Male'), Icon: IconMale },
    { key: 'female', label: pick('إناث', 'Female'), Icon: IconFemale },
  ];

  return (
    <section className="tsection tdiv" aria-labelledby="tdiv-title">
      <h2 id="tdiv-title" className="tsection__title">{pick('الفئات والأوزان', 'Divisions & Weights')}</h2>
      <div className="tpage-card tdiv__card">
        <div className="tdiv__genders" role="group" aria-label={pick('الجنس', 'Gender')}>
          {options.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              className={`tdiv__gender${gender === key ? ' is-active' : ''}`}
              aria-pressed={gender === key}
              onClick={() => setGender(key)}
            >
              <Icon className="tdiv__gender-icon" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {shown.length ? (
          <ul className="tdiv__rows">
            {/* Keyed by gender too, so a row's open state never carries over to the other gender. */}
            {shown.map((d) => <DivisionRow key={`${gender}|${d.key}`} division={d} ar={ar} />)}
          </ul>
        ) : (
          <p className="tdiv__empty">
            {gender === 'male'
              ? pick('لا توجد فئات للذكور في هذه البطولة.', 'This tournament has no male divisions.')
              : pick('لا توجد فئات للإناث في هذه البطولة.', 'This tournament has no female divisions.')}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * One division. Collapsed, its pills keep to a single line; the arrow appears
 * only when they do not all fit on that line at the current width, and opens
 * the rest directly beneath it.
 */
function DivisionRow({ division, ar }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const list = useRef(null);
  const unit = ar ? 'كجم' : 'kg';
  const panelId = `tdiv-weights-${division.key.replace(/[^a-z0-9]+/gi, '-')}`;

  // Whether the pills need a second line: the last one sits lower than the first.
  // Measured on every resize, open or closed, so the arrow follows the layout.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return undefined;
    const measure = () => {
      const pills = el.children;
      const fits = pills.length < 2 || pills[pills.length - 1].offsetTop <= pills[0].offsetTop + 2;
      setOverflows(!fits);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [division.weights.length]);

  const expandable = overflows || open;

  return (
    <li className={`tdiv__row${open ? ' is-open' : ''}${expandable ? ' has-toggle' : ''}`}>
      <span className="tdiv__name">
        <IconUsers className="tdiv__name-icon" aria-hidden="true" />
        {division.name}
      </span>
      <ul className="tdiv__weights" id={panelId} ref={list}>
        {division.weights.map((weight) => (
          <li className="tdiv__pill" key={weight}>
            {/* Isolated so "+81" keeps its sign in front in Arabic too. */}
            <bdi>{toLatinDigits(weight)}</bdi> {unit}
          </li>
        ))}
      </ul>
      {expandable && (
        <button
          type="button"
          className="tdiv__toggle"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open
            ? (ar ? `إخفاء أوزان ${division.name}` : `Show fewer ${division.name} weights`)
            : (ar ? `عرض كل أوزان ${division.name}` : `Show all ${division.name} weights`)}
          onClick={() => setOpen((v) => !v)}
        >
          <IconChevron className="tdiv__chevron" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
