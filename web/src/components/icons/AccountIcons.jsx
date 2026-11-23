/* Icons for the member account area, drawn in the same manner as Icons.jsx:
   dependency-free inline SVG, stroked in currentColor, sized by the stylesheet. */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ children, ...props }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
      <g {...stroke}>{children}</g>
    </svg>
  );
}

export function IconStats(props) {
  return (
    <Svg {...props}>
      <path d="M4 20h16" />
      <path d="M6 16v-4M10 16V8M14 16v-6M18 16V5" />
    </Svg>
  );
}

export function IconPlayers(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.5 14.2A4.5 4.5 0 0 1 20.5 19" />
    </Svg>
  );
}

export function IconCoach(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="8" r="3.2" />
      <path d="M4.5 20a6.5 6.5 0 0 1 11.2-4.5" />
      <circle cx="18" cy="17.5" r="2.2" />
      <path d="M18 15.3v-2.3h2.5" />
    </Svg>
  );
}

export function IconTrophy(props) {
  return (
    <Svg {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5a2 2 0 0 0 0 4H8M16 6h2.5a2 2 0 0 1 0 4H16" />
      <path d="M12 13v4M9 20h6M10 17h4" />
    </Svg>
  );
}

export function IconMail(props) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </Svg>
  );
}

export function IconBuilding(props) {
  return (
    <Svg {...props}>
      <path d="M5 20V6l7-3 7 3v14" />
      <path d="M3.5 20h17M9 9h1M14 9h1M9 12.5h1M14 12.5h1M10.5 20v-4h3v4" />
    </Svg>
  );
}

/** A boxing glove — an athlete on the competition floor. */
export function IconGlove(props) {
  return (
    <Svg {...props}>
      <path d="M7 11V8a5 5 0 0 1 10 0v4.5a4.5 4.5 0 0 1-4.5 4.5H10a3 3 0 0 1-3-3v-3Z" />
      <path d="M7 11a2.5 2.5 0 0 0-2.5 2.5V14A2.5 2.5 0 0 0 7 16.5" />
      <path d="M8 21h8M9 17v4M15 17v4" />
    </Svg>
  );
}

export function IconMale(props) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="14" r="5" />
      <path d="M13.5 10.5 19 5M14.5 5H19v4.5" />
    </Svg>
  );
}

export function IconFemale(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7M9 18h6" />
    </Svg>
  );
}

export function IconMedal(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="15" r="5" />
      <path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8" />
      <path d="M12 13v4" />
    </Svg>
  );
}

export function IconTrend(props) {
  return (
    <Svg {...props}>
      <path d="M4 18 9.5 12.5l3.5 3L20 8" />
      <path d="M15 8h5v5" />
    </Svg>
  );
}

/** A bell — the member's notifications. */
export function IconBell(props) {
  return (
    <Svg {...props}>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15l1.5-2Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Svg>
  );
}

/** A circled "i" — further information. */
export function IconInfo(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </Svg>
  );
}

/** A club's badge: a shield with a star — the club's own account. */
export function IconClubBadge(props) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 5.5v5.8c0 4.4 3 7.9 7 9.2 4-1.3 7-4.8 7-9.2V5.5L12 3Z" />
      <path d="m12 8.2 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4L12 8.2Z" />
    </Svg>
  );
}

/** A document with a cross — a medical file. */
export function IconMedicalFile(props) {
  return (
    <Svg {...props}>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M12 11v5M9.5 13.5h5" />
    </Svg>
  );
}

/* ── tournament registration ───────────────────────────────────────── */

export function IconUpload(props) {
  return (
    <Svg {...props}>
      <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

export function IconDownload(props) {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </Svg>
  );
}

export function IconEdit(props) {
  return (
    <Svg {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </Svg>
  );
}

export function IconClose(props) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconCheck(props) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

/** A page of text — a document or form. */
export function IconFileText(props) {
  return (
    <Svg {...props}>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8L14 3.5Z" />
      <path d="M14 3.5V8h4.5M9 12.5h6M9 16h6" />
    </Svg>
  );
}

/** A clipboard with lines — a summary or set of requirements. */
export function IconClipboard(props) {
  return (
    <Svg {...props}>
      <path d="M9 4.5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-12a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="3" rx="1" />
      <path d="M9 11h6M9 14.5h6M9 18h3" />
    </Svg>
  );
}

/** Two test tubes — a laboratory test. */
export function IconTestTubes(props) {
  return (
    <Svg {...props}>
      <path d="M7 3.5v13a2.5 2.5 0 0 0 5 0v-13M6 3.5h7" />
      <path d="M15 3.5v13a2.5 2.5 0 0 0 5 0v-13M14 3.5h7" />
      <path d="M7 10h5M15 10h5" />
    </Svg>
  );
}

/** A heart with a pulse — health. */
export function IconHeartPulse(props) {
  return (
    <Svg {...props}>
      <path d="M12 20s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.2 4.5 4.5 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" />
      <path d="M7.5 12h2.5l1.2-2 1.6 4 1.2-2h2.5" />
    </Svg>
  );
}

/** A list with ticks — declarations. */
export function IconChecklist(props) {
  return (
    <Svg {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="m7.5 8 1.2 1.2L11 7M13 8.5h4M7.5 13l1.2 1.2L11 12M13 13.5h4M13 18h4" />
    </Svg>
  );
}

/** A dumbbell — a weight class. */
export function IconDumbbell(props) {
  return (
    <Svg {...props}>
      <path d="M8 12h8M5.5 8.5v7M8 7v10M16 7v10M18.5 8.5v7M3.5 12h2M18.5 12h2" />
    </Svg>
  );
}

/** A bag with a handle — a weight. */
export function IconWeight(props) {
  return (
    <Svg {...props}>
      <path d="M6.5 8.5h11l2 11h-15l2-11Z" />
      <path d="M9.5 8.5a2.5 2.5 0 0 1 5 0" />
    </Svg>
  );
}

/** A ruler — a height. */
export function IconRuler(props) {
  return (
    <Svg {...props}>
      <rect x="8" y="3" width="8" height="18" rx="1.5" />
      <path d="M8 7h3M8 10.5h2M8 14h3M8 17.5h2" />
    </Svg>
  );
}

/** A chevron pointing right, or — with left — pointing left. */
export function IconChevron({ left = false, ...props }) {
  return (
    <Svg {...props}>
      <path d={left ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6'} />
    </Svg>
  );
}

export function IconLogout(props) {
  return (
    <Svg {...props}>
      <path d="M10 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <path d="M14 8l4 4-4 4M18 12H9" />
    </Svg>
  );
}
