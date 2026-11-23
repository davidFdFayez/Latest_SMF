import { useLayoutEffect, useMemo, useState } from 'react';
import { IconPerson, IconTrophy } from '../icons/Icons';
import { CountryTag } from './Nationality';

/**
 * A division's single-elimination bracket for the public site.
 *
 * Built only from the public draw (round names, each bout's corners, BYE /
 * walkover markers, winners once results exist). The layout is computed, not
 * guessed: round 1 bouts are stacked; every later bout sits exactly between the
 * two bouts that feed it; a connector runs from each bout to the corner of the
 * bout its winner goes to (position p feeds ⌈p/2⌉, red when p is odd), and the
 * Final to the Champion. In Arabic the bracket reads right to left.
 *
 * Large brackets (64, 128) keep full-size cards: the bracket scrolls inside its
 * frame in both directions, and the round headings stay visible at its top.
 *
 * Each athlete has a circular photo only when the athlete authorized public
 * display (the API announces a version key); otherwise, and whenever an image
 * fails to load, a neutral avatar. `photos` is the slot-addressed photo route.
 */
export default function PublicBracket({ draw, photos, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const narrow = useNarrow();
  const W = narrow ? 230 : 240; // card width — 230 on a phone leaves room for the avatar and a full name
  const H = 84; // card height (two rows)
  const GAP = 16; // between first-round cards
  const COL = W + (narrow ? 40 : 60); // column pitch
  const CHAMP = narrow ? 150 : 190;
  const HEAD = 46;

  const rounds = draw.rounds || [];
  const R = rounds.length;
  const n1 = R ? rounds[0].bouts.length : 0;

  const layout = useMemo(() => {
    const y = []; // y[r][p-1], logical
    for (let r = 0; r < R; r++) {
      y[r] = rounds[r].bouts.map((b, i) => {
        if (r === 0) return i * (H + GAP);
        const a = y[r - 1][2 * i], c = y[r - 1][2 * i + 1];
        return ((a ?? 0) + (c ?? a ?? 0)) / 2;
      });
    }
    const width = R * COL + CHAMP;
    const height = Math.max(n1 * (H + GAP) - GAP, H);
    const X = (logicalX, w) => (ar ? width - logicalX - w : logicalX);
    const lines = [];
    for (let r = 0; r < R; r++) {
      rounds[r].bouts.forEach((b, i) => {
        const sy = y[r][i] + H / 2;
        const outer = (r + 1) * COL - (COL - W); // logical x of this card's outer edge
        if (r === R - 1) {
          const ex = R * COL + 8;
          lines.push({ key: 'f', d: path(X(outer, 0), sy, X((outer + ex) / 2, 0), sy, X(ex, 0)) });
          return;
        }
        const ny = y[r + 1][Math.floor(i / 2)] + (i % 2 === 0 ? H / 4 : (3 * H) / 4);
        const inner = (r + 1) * COL;
        const mid = outer + (COL - W) / 2;
        lines.push({ key: `${r}-${i}`, d: path(X(outer, 0), sy, X(mid, 0), ny, X(inner, 0)) });
      });
    }
    return { y, width, height, X, lines, champY: R ? y[R - 1][0] : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draw, ar, narrow]);

  const prevName = (r) => (r > 0 ? pick(rounds[r - 1].nameAr, rounds[r - 1].nameEn) : '');
  const columns = [...rounds.map((r) => pick(r.nameAr, r.nameEn)), pick('البطل', 'Champion')];

  return (
    <div className={`pbracket${narrow ? ' is-narrow' : ''}`} dir={ar ? 'rtl' : 'ltr'}>
      <div className="pbracket__frame" tabIndex={0} aria-label={pick('جدول القرعة، مرّر لرؤية كل الأدوار', 'Bracket, scroll to see every round')}>
        <div className="pbracket__heads" style={{ width: layout.width, height: HEAD }}>
          {columns.map((name, i) => {
            const w = i < R ? W : CHAMP;
            return (
              <h3 key={name} className="pbracket__head" style={{ left: layout.X(i * COL, w), width: w }}>
                {name}
              </h3>
            );
          })}
        </div>
        <div className="pbracket__canvas" style={{ width: layout.width, height: layout.height }}>
          <svg className="pbracket__lines" width={layout.width} height={layout.height} aria-hidden="true">
            {layout.lines.map((l) => <path key={l.key} d={l.d} />)}
          </svg>
          {rounds.map((round, r) =>
            round.bouts.map((b, i) => (
              <article
                key={`${r}-${i}`}
                className={`pbracket__card${b.isBye ? ' is-bye' : ''}`}
                style={{ left: layout.X(r * COL, W), top: layout.y[r][i], width: W, height: H }}
                aria-label={`${pick(round.nameAr, round.nameEn)}: ${slotLabel(b, 'red', ar)} — ${slotLabel(b, 'blue', ar)}`}
              >
                <Slot bout={b} corner="red" round={r} roundNo={round.round} prev={prevName(r)} photos={photos} ar={ar} />
                <Slot bout={b} corner="blue" round={r} roundNo={round.round} prev={prevName(r)} photos={photos} ar={ar} />
              </article>
            )),
          )}
          {R > 0 && (
            <div className="pbracket__champion" style={{ left: layout.X(R * COL + 8, CHAMP - 8), top: layout.champY, width: CHAMP - 8, height: H }}>
              <IconTrophy className="pbracket__trophy" aria-hidden="true" />
              <span className="pbracket__champion-label">{pick('البطل', 'Champion')}</span>
              <span className="pbracket__champion-name">{championName(draw, ar) || pick('الفائز في النهائي', 'Winner of the Final')}</span>
              <CountryTag code={champion(draw)?.nationality} ar={ar} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Slot({ bout, corner, round, roundNo, prev, photos, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const athlete = bout[corner];
  const won = bout.winner === corner;
  if (!athlete) {
    const byeRow = bout.isBye && round === 0;
    return (
      <div className={`pbracket__row pbracket__row--${corner} is-waiting`}>
        <span className="pbracket__corner" aria-hidden="true" />
        <Avatar />
        <span className="pbracket__wait">
          {byeRow ? pick('تأهل مباشر (BYE)', 'BYE — advances directly') : bout.isWalkover ? pick('انسحاب', 'Withdrawn') : `${pick('الفائز من', 'Winner of')} ${prev}`}
        </span>
      </div>
    );
  }
  const src = athlete.photo && photos ? `${photos}/${roundNo}/${bout.position}/${corner}?v=${athlete.photo}` : null;
  return (
    <div className={`pbracket__row pbracket__row--${corner}${won ? ' is-winner' : ''}`}>
      <span className="pbracket__corner" aria-hidden="true" />
      <Avatar src={src} />
      <span className="pbracket__who">
        <span className="pbracket__name" title={nameOf(athlete, ar)}>{nameOf(athlete, ar)}</span>
        <CountryTag code={athlete.nationality} ar={ar} />
      </span>
      {won && bout.isWalkover && <span className="pbracket__tag">{pick('فوز بالانسحاب', 'WO')}</span>}
    </div>
  );
}

/** A circular athlete photo, or the neutral avatar when there is none or it fails to load. Decorative: the name is the label. */
function Avatar({ src }) {
  const [failed, setFailed] = useState(false);
  const photo = src && !failed;
  return (
    <span className={`pbracket__avatar${photo ? ' has-photo' : ''}`} aria-hidden="true">
      {photo ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable="false" onError={() => setFailed(true)} />
      ) : (
        <IconPerson className="pbracket__avatar-icon" />
      )}
    </span>
  );
}

const nameOf = (a, ar) => (ar ? a.nameAr || a.nameEn : a.nameEn || a.nameAr) || '';
const slotLabel = (b, corner, ar) => {
  const who = b[corner] ? nameOf(b[corner], ar) : ar ? 'بانتظار المتأهل' : 'to be decided';
  return `${corner === 'red' ? (ar ? 'الأحمر' : 'red') : ar ? 'الأزرق' : 'blue'} ${who}`;
};
const champion = (draw) => {
  const final = draw.rounds?.[draw.rounds.length - 1]?.bouts?.[0];
  return final?.winner && final[final.winner] ? final[final.winner] : null;
};
const championName = (draw, ar) => (champion(draw) ? nameOf(champion(draw), ar) : null);
const path = (sx, sy, mx, my, ex) => `M${sx} ${sy} H${mx} V${my} H${ex}`;

function useNarrow() {
  const query = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useLayoutEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}
