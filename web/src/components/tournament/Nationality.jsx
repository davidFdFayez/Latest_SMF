import { useEffect, useState } from 'react';
import { countryCode } from '../../data/countryCodes';

/*
 * Athlete nationality for the public competition screens — shared by the Match Schedule and the bracket, so both
 * show the same flag and sport (IOC) country code from the same registration field (ISO alpha-2 → e.g. "KSA").
 */

// Each flag is its own small file, fetched only when a country actually appears.
const FLAG_FILES = import.meta.glob('../../../node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default' });
// Only real countries: the set also holds non-country flags (XX "unknown", EU, UN), which are never shown.
const NOT_COUNTRIES = new Set(['XX', 'EU', 'UN']);
export const isCountry = (code) => {
  if (NOT_COUNTRIES.has(code)) return false;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return !!name && name !== code;
  } catch {
    return false;
  }
};
const flagLoader = (code) =>
  isCountry(code) ? FLAG_FILES[`../../../node_modules/flag-icons/flags/4x3/${String(code).toLowerCase()}.svg`] : undefined;

/** The nationality flag (ISO alpha-2), or a neutral marker when the country is not known. Never guessed. */
export function Flag({ code, ar }) {
  const load = code ? flagLoader(code) : null;
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (load) load().then((url) => live && setSrc(url)).catch(() => live && setSrc(null));
    return () => {
      live = false;
    };
  }, [load]);
  if (!load) {
    const unknown = ar ? 'الجنسية غير متاحة' : 'Nationality not available';
    return (
      <span className="tms__flag tms__flag--none" role="img" aria-label={unknown} title={unknown} data-testid="tmatch-flag" data-flag="none">
        <IconGlobe aria-hidden="true" />
      </span>
    );
  }
  let country = code;
  try {
    country = new Intl.DisplayNames([ar ? 'ar' : 'en'], { type: 'region' }).of(code) || code;
  } catch {
    /* keep the code */
  }
  return (
    <span className="tms__flag" role="img" aria-label={country} title={country} data-testid="tmatch-flag" data-flag={code}>
      {src && <img src={src} alt="" draggable="false" />}
    </span>
  );
}

/**
 * The bracket's line under an athlete's name: a small flag and the sport country code. Nothing at all when the
 * nationality is not known (no guess, no placeholder), so an unknown athlete simply has no second line.
 */
export function CountryTag({ code, ar }) {
  if (!code || !isCountry(code)) return null;
  return (
    <span className="tms__nat pbracket__nat" data-testid="pbracket-nat" data-nat={countryCode(code)}>
      <Flag code={code} ar={ar} />
      <span className="tms__nat-code" aria-hidden="true">{countryCode(code)}</span>
    </span>
  );
}

function IconGlobe(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5M12 3.5C9.6 5.9 8.5 8.7 8.5 12s1.1 6.1 3.5 8.5" />
    </svg>
  );
}

