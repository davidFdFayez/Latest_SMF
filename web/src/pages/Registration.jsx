import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';
import { submitRegistration, uploadRegistrationAttachment } from '../api/services';
import { COUNTRY_BY_CODE, DEFAULT_COUNTRY, DEFAULT_DIAL, DIAL_CODES, countriesFor } from '../data/countries';
import {
  ACCEPTED_FILE_TYPES,
  AGE_LIMITS,
  ATTACHMENTS,
  ATTACHMENT_GROUPS,
  DEFAULTS,
  FIELDS,
  MAX_FILE_BYTES,
  MAX_FILE_LABEL,
  REGISTRATION_TYPES,
  REVIEW_ROWS,
  STEPS,
  TYPE_ROUTE_ALIASES,
  ageFrom,
  categoryFor,
  isMinor,
  weightDivisionFor,
  weightRangeFor,
} from '../data/registrationPortal';

/* ── validation ──────────────────────────────────────────────────────────── */

// Arabic block, Arabic Supplement, and Extended-A — enough for every spelling
// of a Saudi or wider Arab name without pulling in the presentation forms.
const ARABIC_RANGE = '\\u0600-\\u06FF\\u0750-\\u077F\\u08A0-\\u08FF';

const hasArabic = (value) => new RegExp(`[${ARABIC_RANGE}]`).test(value);
const hasLatin = (value) => /[A-Za-z]/.test(value);
const hasDigit = (value) => /\d/.test(value);

/** Arabic (or Latin) letters plus the separators a name legitimately contains. */
const ARABIC_TEXT = new RegExp(`^[${ARABIC_RANGE}\\s'’\\-.()/]+$`);
const LATIN_TEXT = /^[A-Za-z\s'’\-.()/]+$/;

const bilingual = (ar, en) => ({ ar, en });

/**
 * Every rule the portal enforces. `test` receives the trimmed value plus the
 * whole form, so range checks that depend on another answer (weight against
 * age, date of birth against the category's limits) live here rather than
 * being scattered through the components.
 *
 * The same rules are mirrored server-side — see RegistrationValidator in the
 * API. Anything relaxed here must be relaxed there too.
 */
const VALIDATORS = {
  email: {
    test: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value),
    message: () => bilingual('يرجى إدخال بريد إلكتروني صحيح.', 'Please enter a valid email address.'),
  },

  // Stored in E.164 by the phone control, so the check is on the final shape.
  phone: {
    test: (value) => /^\+[1-9]\d{7,14}$/.test(value.replace(/[\s()-]/g, '')),
    message: () =>
      bilingual(
        'يرجى إدخال رقم جوال دولي صحيح مع مفتاح الدولة، مثال: ‎+966512345678‎.',
        'Please enter a valid international number including the country code, e.g. +966512345678.',
      ),
  },

  // Saudi ID and Iqama numbers are exactly 10 digits; passports are alphanumeric.
  nationalId: {
    test: (value) => {
      const trimmed = value.replace(/\s/g, '');
      return /^\d+$/.test(trimmed) ? trimmed.length === 10 : /^[A-Za-z0-9]{5,15}$/.test(trimmed);
    },
    message: () =>
      bilingual(
        'رقم الهوية يتكون من 10 أرقام، أو أدخل رقم جواز صحيح.',
        'An ID number is 10 digits, or enter a valid passport number.',
      ),
  },

  url: {
    test: (value) => /^https?:\/\/\S+$/i.test(value),
    message: () => bilingual('يرجى إدخال رابط يبدأ بـ https://', 'Please enter a link starting with https://'),
  },

  // REG-04 — an Arabic field must hold Arabic script, and only that.
  arabicName: {
    test: (value) => value.length >= 2 && hasArabic(value) && !hasLatin(value) && !hasDigit(value) && ARABIC_TEXT.test(value),
    message: () =>
      bilingual(
        'يرجى الكتابة بالأحرف العربية فقط (حرفان على الأقل، بدون أرقام).',
        'Please use Arabic letters only (at least two characters, no digits).',
      ),
  },
  latinName: {
    test: (value) => value.length >= 2 && hasLatin(value) && !hasArabic(value) && !hasDigit(value) && LATIN_TEXT.test(value),
    message: () =>
      bilingual(
        'يرجى الكتابة بالأحرف اللاتينية فقط (حرفان على الأقل، بدون أرقام).',
        'Please use Latin letters only (at least two characters, no digits).',
      ),
  },
  arabicText: {
    test: (value) => value.length >= 2 && hasArabic(value) && !hasLatin(value),
    message: () => bilingual('يرجى الكتابة بالأحرف العربية.', 'Please write this in Arabic script.'),
  },
  latinText: {
    test: (value) => value.length >= 2 && hasLatin(value) && !hasArabic(value),
    message: () => bilingual('يرجى الكتابة بالأحرف اللاتينية.', 'Please write this in Latin script.'),
  },

  // REG-11 — a plausible competition weight for the athlete's age band.
  weight: {
    test: (value, values) => {
      const weight = Number(value);
      const { min, max } = weightRangeFor(values);
      return Number.isFinite(weight) && weight >= min && weight <= max;
    },
    message: (values) => {
      const { min, max } = weightRangeFor(values);
      return bilingual(
        `يرجى إدخال وزن بين ${min} و${max} كجم لهذه الفئة العمرية.`,
        `Please enter a weight between ${min} and ${max} kg for this age band.`,
      );
    },
  },
};

/* REG-05 — one date-of-birth rule per category, built from the shared limits. */
for (const [type, limits] of Object.entries(AGE_LIMITS)) {
  VALIDATORS[`dob_${type}`] = {
    test: (value) => {
      const age = ageFrom(value);
      return age !== null && age >= limits.min && age <= limits.max;
    },
    message: () =>
      bilingual(
        `العمر المقبول لهذا التسجيل من ${limits.min} إلى ${limits.max} سنة.`,
        `The eligible age for this registration is ${limits.min} to ${limits.max}.`,
      ),
  };
}

const REQUIRED_MESSAGE = bilingual('هذا الحقل مطلوب.', 'This field is required.');

/** Resolve `required` / `when`, which may be a boolean or a predicate. */
const resolve = (rule, values) => (typeof rule === 'function' ? Boolean(rule(values)) : Boolean(rule));

const visibleFields = (fields, values) => fields.filter((field) => (field.when ? resolve(field.when, values) : true));

function fieldError(field, values, ar) {
  const raw = values[field.name];
  const value = typeof raw === 'string' ? raw.trim() : raw ?? '';

  if (value === '' || value === null || value === undefined) {
    return resolve(field.required, values) ? REQUIRED_MESSAGE[ar ? 'ar' : 'en'] : '';
  }

  const rule = field.validate ? VALIDATORS[field.validate] : null;
  if (rule && !rule.test(String(value), values)) {
    return rule.message(values)[ar ? 'ar' : 'en'];
  }
  return '';
}

/* ── phone helpers (REG-08) ──────────────────────────────────────────────── */

/** National part of an E.164 number, given the dial code currently selected. */
function nationalPart(value, dial) {
  if (!value) return '';
  const digits = String(value).replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return digits.replace(/^0+/, '');

  const rest = digits.slice(1);
  if (rest.startsWith(dial)) return rest.slice(dial.length);

  // The stored number carries a different country code than the selector —
  // fall back to the longest dial code that matches so nothing is lost.
  const match = DIAL_CODES.find((code) => rest.startsWith(code));
  return match ? rest.slice(match.length) : rest;
}

/* ── image compression (REG-09) ──────────────────────────────────────────── */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const blobToFile = (blob, name, type) =>
  new File([blob], name, { type, lastModified: Date.now() });

const toBlob = (canvas, type, quality) =>
  new Promise((done) => canvas.toBlob(done, type, quality));

/**
 * Shrinks a photo or scanned document until it fits the 1 MB cap, by first
 * bounding its longest edge and then stepping the JPEG/WebP quality down.
 * Returns the original file when it already fits, when it is not an image, or
 * when the browser cannot decode it — the size check then rejects it instead.
 */
async function compressImage(file) {
  if (file.size <= MAX_FILE_BYTES) return file;
  if (!IMAGE_TYPES.includes(file.type)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  // PNG and WebP may carry transparency, which JPEG would flatten to black.
  const outputType = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
  const extension = outputType === 'image/jpeg' ? '.jpg' : '.webp';
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'upload';

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  try {
    for (const maxEdge of [2000, 1600, 1200, 900]) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));

      const context = canvas.getContext('2d');
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.82, 0.7, 0.6, 0.5]) {
        const blob = await toBlob(canvas, outputType, quality);
        if (blob && blob.size <= MAX_FILE_BYTES) {
          return blobToFile(blob, `${baseName}${extension}`, outputType);
        }
      }
    }
    return file;
  } finally {
    bitmap.close?.();
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

const draftKey = (type) => `smf:registration-draft:${type}`;

/** Human-readable value for the review panel — resolves select/radio labels. */
function displayValue(field, values, ar) {
  const value = values[field.name];
  if (value === undefined || value === null || value === '') return '';
  if (!field.options) return String(value);

  const option = field.options.find((entry) => entry.value === value);
  return option ? (ar ? option.ar : option.en) : String(value);
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ── field control ───────────────────────────────────────────────────────── */

function PhoneControl({ field, values, value, ar, shared, onChange }) {
  const countryKey = `${field.name}Country`;
  const country = values[countryKey] || DEFAULT_COUNTRY;
  const dial = COUNTRY_BY_CODE.get(country)?.dial || DEFAULT_DIAL;
  const national = nationalPart(value, dial);
  const countries = useMemo(() => countriesFor(ar ? 'ar' : 'en'), [ar]);

  function setCountry(nextCode) {
    const nextDial = COUNTRY_BY_CODE.get(nextCode)?.dial || DEFAULT_DIAL;
    onChange(countryKey, nextCode);
    onChange(field.name, national ? `+${nextDial}${national}` : '');
  }

  function setNumber(raw) {
    const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
    onChange(field.name, digits ? `+${dial}${digits}` : '');
  }

  return (
    <div className="regw-phone" dir="ltr">
      <select
        className="regw-phone__country"
        value={country}
        onChange={(event) => setCountry(event.target.value)}
        onBlur={shared.onBlur}
        aria-label={ar ? 'الدولة ومفتاح الاتصال' : 'Country and dialling code'}
      >
        {countries.map((entry) => (
          <option key={entry.code} value={entry.code}>
            +{entry.dial} · {ar ? entry.ar : entry.en}
          </option>
        ))}
      </select>

      {/* One bordered group: the prefix reads as part of the number, and stays
          on screen even when the picker beside it has to truncate. */}
      <div className="regw-phone__entry">
        <span className="regw-phone__dial" aria-hidden="true">+{dial}</span>
        <input
          id={shared.id}
          name={field.name}
          className="regw-phone__number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={national}
          onChange={(event) => setNumber(event.target.value)}
          onBlur={shared.onBlur}
          placeholder={country === 'SA' ? '5XXXXXXXX' : 'XXXXXXXXX'}
          aria-invalid={shared['aria-invalid']}
          aria-describedby={shared['aria-describedby']}
        />
      </div>
    </div>
  );
}

function FieldControl({ field, value, values, error, ar, onChange, onBlur }) {
  const label = ar ? field.label.ar : field.label.en;
  const isRequired = resolve(field.required, values);
  const id = `regw-${field.name}`;
  const describedBy = error ? `${id}-error` : field.hint ? `${id}-hint` : undefined;
  const shared = {
    id,
    name: field.name,
    value: value ?? '',
    onChange: (event) => onChange(field.name, event.target.value),
    onBlur: () => onBlur(field.name),
    dir: field.dir,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': describedBy,
  };

  // Nationality (and any other picker with a second ordering) sorts by the
  // language the applicant is reading.
  const options = !ar && field.optionsEn ? field.optionsEn : field.options;

  return (
    <div className={`regw-field regw-field--${field.span || 12}${error ? ' regw-field--invalid' : ''}`}>
      {field.control === 'radio' ? (
        <fieldset className="regw-fieldset">
          <legend className="regw-label">
            {label}
            {isRequired ? <span className="regw-req" aria-hidden="true"> *</span> : null}
          </legend>
          <div className="regw-toggle">
            {options.map((option) => (
              <label key={option.value} className={value === option.value ? 'is-active' : undefined}>
                <input
                  type="radio"
                  name={field.name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={(event) => onChange(field.name, event.target.value)}
                />
                <span>{ar ? option.ar : option.en}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label className="regw-label" htmlFor={id}>
            {label}
            {isRequired ? (
              <span className="regw-req" aria-hidden="true"> *</span>
            ) : (
              <span className="regw-optional">{ar ? 'اختياري' : 'optional'}</span>
            )}
          </label>

          {field.control === 'phone' ? (
            <PhoneControl field={field} values={values} value={value} ar={ar} shared={shared} onChange={onChange} />
          ) : field.control === 'select' ? (
            <select {...shared}>
              <option value="">{ar ? 'اختر…' : 'Select…'}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {ar ? option.ar : option.en}
                </option>
              ))}
            </select>
          ) : field.control === 'textarea' ? (
            <textarea {...shared} rows={4} placeholder={field.placeholder} />
          ) : (
            <input
              {...shared}
              type={field.control === 'number' ? 'number' : field.control || 'text'}
              step={field.step}
              placeholder={field.placeholder}
              max={field.control === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
            />
          )}
        </>
      )}

      {field.hint && !error && (
        <span className="regw-hint" id={`${id}-hint`}>
          {ar ? field.hint.ar : field.hint.en}
        </span>
      )}
      {error && (
        <span className="regw-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

/* ── page ────────────────────────────────────────────────────────────────── */

export default function Registration() {
  const { type: typeParam } = useParams();
  const navigate = useNavigate();
  const { lang } = useLang();
  const ar = lang === 'ar';

  const routedType = TYPE_ROUTE_ALIASES[typeParam] || '';
  const [type, setType] = useState(routedType);
  const [step, setStep] = useState(routedType ? 1 : 0);
  const [values, setValues] = useState(() => ({ ...(DEFAULTS[routedType] || {}) }));
  const [files, setFiles] = useState({});
  const [touched, setTouched] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [serverErrors, setServerErrors] = useState({});
  const [submitState, setSubmitState] = useState({ loading: false, error: '', result: null });
  const [notice, setNotice] = useState('');

  const restoredFor = useRef('');
  const syncedType = useRef(routedType);
  const noticeTimer = useRef(null);
  const topRef = useRef(null);

  const typeMeta = REGISTRATION_TYPES.find((entry) => entry.key === type);
  const fieldSets = type ? FIELDS[type] : null;
  const attachmentSlots = useMemo(
    () => (type ? ATTACHMENTS[type].filter((slot) => (slot.when ? resolve(slot.when, values) : true)) : []),
    [type, values],
  );

  const flash = useCallback((message) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 2600);
  }, []);

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  /* Restore a saved draft once per category. */
  useEffect(() => {
    if (!type || restoredFor.current === type) return;
    restoredFor.current = type;

    try {
      const raw = localStorage.getItem(draftKey(type));
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.values) setValues({ ...(DEFAULTS[type] || {}), ...draft.values });
      if (draft?.files) setFiles(draft.files);
      flash(ar ? 'تمت استعادة مسودة سابقة.' : 'A saved draft was restored.');
    } catch {
      /* A corrupt draft is simply ignored. */
    }
  }, [type, ar, flash]);

  /* Persist the draft as the applicant types. Consent is never stored. */
  useEffect(() => {
    if (!type || submitState.result) return;
    const handle = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(type), JSON.stringify({ values, files }));
      } catch {
        /* Storage full or blocked — the form still works, it just won't resume. */
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [type, values, files, submitState.result]);

  /*
   * The URL is the single source of truth for the chosen category.
   *
   * This effect used to run the other way round — it pushed the *state* back
   * into the URL — which meant selecting a different form in the top menu
   * changed the address for a frame and was then immediately reverted, so the
   * four forms were unreachable from one another (REG-01). Now an incoming
   * route change resets the wizard onto that category instead.
   */
  useEffect(() => {
    if (!typeParam) return;

    if (!routedType) {
      // An unknown segment (/registration/xyz) belongs on the hub, not here.
      navigate('/registration', { replace: true });
      return;
    }

    // Compared against a ref rather than against `type`, so a render that
    // lands between the state update and the route update cannot make this
    // effect undo a category the applicant just picked.
    if (routedType === syncedType.current) return;
    syncedType.current = routedType;

    setType(routedType);
    setValues({ ...(DEFAULTS[routedType] || {}) });
    setFiles({});
    setTouched({});
    setShowErrors(false);
    setAttachmentError('');
    setServerErrors({});
    setConsent(false);
    setConsentError(false);
    setSubmitState({ loading: false, error: '', result: null });
    setStep(1);
    restoredFor.current = '';
  }, [typeParam, routedType, navigate]);

  /*
   * REG-05 — the competition category follows from age, weight, gender, and the
   * para declaration. It is written back into the form so the applicant sees
   * (and the federation receives) the value, and stays editable afterwards.
   */
  useEffect(() => {
    if (type !== 'athlete') return;
    setValues((current) => {
      const next = categoryFor(current);
      return next && next !== current.athleteCategory ? { ...current, athleteCategory: next } : current;
    });
  }, [type, values.dateOfBirth, values.currentWeight, values.gender, values.paraAthlete]);

  const goToStep = useCallback((next) => {
    setStep(next);
    setShowErrors(false);
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  function update(name, value) {
    setValues((current) => ({ ...current, [name]: value }));
    setServerErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function markTouched(name) {
    setTouched((current) => ({ ...current, [name]: true }));
  }

  function chooseType(nextType) {
    if (nextType === type) return;
    setType(nextType);
    setValues({ ...(DEFAULTS[nextType] || {}) });
    setFiles({});
    setTouched({});
    setShowErrors(false);
    setServerErrors({});
    restoredFor.current = '';
    syncedType.current = nextType;

    // Keep the address bar linkable. The URL-sync effect above sees the route
    // it already knows about, so it leaves the wizard on the category step.
    const meta = REGISTRATION_TYPES.find((entry) => entry.key === nextType);
    if (meta) navigate(`/registration/${meta.route}`, { replace: true });
  }

  /* ── attachments ───────────────────────────────────────────────────────── */

  async function pickFile(slotKey, picked) {
    if (!picked) return;
    setAttachmentError('');

    setFiles((current) => ({ ...current, [slotKey]: { status: 'uploading', fileName: picked.name, progress: 0 } }));

    // REG-09 — images are shrunk to fit the cap; anything still oversized
    // (a large PDF) is refused with the limit spelled out.
    let file = picked;
    try {
      file = await compressImage(picked);
    } catch {
      file = picked;
    }

    if (file.size > MAX_FILE_BYTES) {
      setFiles((current) => ({
        ...current,
        [slotKey]: {
          status: 'error',
          fileName: picked.name,
          error: ar
            ? `حجم الملف يتجاوز ${MAX_FILE_LABEL.ar}. يرجى تصغير الملف والمحاولة مرة أخرى.`
            : `The file exceeds ${MAX_FILE_LABEL.en}. Please reduce it and try again.`,
        },
      }));
      return;
    }

    try {
      const stored = await uploadRegistrationAttachment(file, (progress) =>
        setFiles((current) => ({ ...current, [slotKey]: { ...current[slotKey], progress } })),
      );
      setFiles((current) => ({ ...current, [slotKey]: { status: 'done', ...stored } }));
    } catch (err) {
      setFiles((current) => ({
        ...current,
        [slotKey]: {
          status: 'error',
          fileName: picked.name,
          error: err?.response?.data?.message || (ar ? 'تعذر رفع الملف.' : 'The file could not be uploaded.'),
        },
      }));
    }
  }

  function removeFile(slotKey) {
    setFiles((current) => {
      const next = { ...current };
      delete next[slotKey];
      return next;
    });
  }

  /**
   * The upload step, laid out as a list of single slots and "one of" groups.
   * REG-10 — a group is rendered as one required block so an unsatisfied
   * `oneOf` shows an asterisk and its own error instead of blocking submission
   * with nothing on screen.
   */
  const attachmentBlocks = useMemo(() => {
    const blocks = [];
    const seen = new Set();

    for (const slot of attachmentSlots) {
      if (!slot.oneOf) {
        blocks.push({ kind: 'single', slot });
        continue;
      }
      if (seen.has(slot.oneOf)) continue;
      seen.add(slot.oneOf);
      blocks.push({
        kind: 'group',
        group: slot.oneOf,
        meta: ATTACHMENT_GROUPS[slot.oneOf],
        slots: attachmentSlots.filter((entry) => entry.oneOf === slot.oneOf),
      });
    }
    return blocks;
  }, [attachmentSlots]);

  /** Missing mandatory documents, honouring "one of" groups. */
  const missingAttachments = useMemo(() => {
    const isUploaded = (key) => files[key]?.status === 'done';
    const missing = [];

    for (const block of attachmentBlocks) {
      if (block.kind === 'group') {
        if (!block.slots.some((entry) => isUploaded(entry.key))) missing.push(block);
      } else if (resolve(block.slot.required, values) && !isUploaded(block.slot.key)) {
        missing.push(block);
      }
    }
    return missing;
  }, [attachmentBlocks, files, values]);

  const missingKeys = useMemo(
    () => new Set(missingAttachments.map((block) => (block.kind === 'group' ? `group:${block.group}` : block.slot.key))),
    [missingAttachments],
  );

  /* ── step validation ───────────────────────────────────────────────────── */

  const stepFields = useCallback(
    (index) => {
      if (!fieldSets) return [];
      if (index === 1) return visibleFields(fieldSets.identity, values);
      if (index === 2) return visibleFields(fieldSets.contact, values);
      if (index === 3) return visibleFields(fieldSets.details, values);
      return [];
    },
    [fieldSets, values],
  );

  const errorsFor = useCallback(
    (index) => {
      const map = {};
      for (const field of stepFields(index)) {
        const message = fieldError(field, values, ar);
        if (message) map[field.name] = message;
        else if (serverErrors[field.name]) map[field.name] = serverErrors[field.name];
      }
      return map;
    },
    [stepFields, values, ar, serverErrors],
  );

  const currentErrors = useMemo(() => errorsFor(step), [errorsFor, step]);

  function validateAndAdvance() {
    if (step === 0) {
      if (!type) {
        flash(ar ? 'اختر نوع التسجيل أولاً.' : 'Choose a registration category first.');
        return;
      }
      goToStep(1);
      return;
    }

    if (step < 4) {
      if (Object.keys(currentErrors).length > 0) {
        setShowErrors(true);
        flash(ar ? 'يرجى استكمال الحقول المطلوبة.' : 'Please complete the required fields.');
        return;
      }
      goToStep(step + 1);
      return;
    }

    handleSubmit();
  }

  async function handleSubmit() {
    // Re-check every earlier step, since the applicant may have jumped back.
    for (let index = 1; index <= 3; index += 1) {
      const errors = errorsFor(index);
      if (Object.keys(errors).length > 0) {
        setShowErrors(true);
        goToStep(index);
        flash(ar ? 'يرجى استكمال الحقول المطلوبة.' : 'Please complete the required fields.');
        return;
      }
    }

    if (missingAttachments.length > 0) {
      setAttachmentError(ar ? 'يرجى إرفاق المستندات المطلوبة.' : 'Please attach the required documents.');
      return;
    }
    if (Object.values(files).some((entry) => entry.status === 'uploading')) {
      setAttachmentError(ar ? 'يرجى الانتظار حتى اكتمال رفع الملفات.' : 'Please wait until the uploads finish.');
      return;
    }
    if (!consent) {
      setConsentError(true);
      return;
    }

    setConsentError(false);
    setAttachmentError('');
    setServerErrors({});
    setSubmitState({ loading: true, error: '', result: null });

    const attachments = Object.fromEntries(
      Object.entries(files)
        .filter(([, entry]) => entry.status === 'done')
        .map(([key, entry]) => [key, { id: entry.id, fileName: entry.fileName, contentType: entry.contentType, size: entry.size }]),
    );

    try {
      const result = await submitRegistration(type, {
        ...values,
        registrationType: type,
        // Derived values the federation reviews alongside the raw answers.
        ...(type === 'athlete' ? { weightDivision: weightDivisionFor(values) } : null),
        attachments,
        consent: true,
        submittedLanguage: lang,
        submittedAt: new Date().toISOString(),
      });

      setSubmitState({ loading: false, error: '', result });
      try {
        localStorage.removeItem(draftKey(type));
      } catch {
        /* Nothing to clean up if storage is unavailable. */
      }
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      // The API answers a rejected submission with field-level errors (SEC-01),
      // so they are shown against the fields rather than as one opaque message.
      const data = err?.response?.data;
      const fields = data?.errors && typeof data.errors === 'object' ? data.errors : null;

      if (fields) {
        const mapped = Object.fromEntries(
          Object.entries(fields).map(([name, message]) => [
            name,
            typeof message === 'string' ? message : (ar ? message?.ar : message?.en) || '',
          ]),
        );
        setServerErrors(mapped);

        for (let index = 1; index <= 3; index += 1) {
          if (stepFields(index).some((field) => mapped[field.name])) {
            setShowErrors(true);
            goToStep(index);
            break;
          }
        }
      }

      setSubmitState({
        loading: false,
        error:
          (ar ? data?.messageAr : data?.messageEn) ||
          data?.message ||
          (ar ? 'تعذر إرسال الطلب. يرجى المحاولة مرة أخرى.' : 'The request could not be submitted. Please try again.'),
        result: null,
      });
    }
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const age = ageFrom(values.dateOfBirth);
  const minor = type === 'athlete' && isMinor(values);
  const division = type === 'athlete' ? weightDivisionFor(values) : '';

  const heroTitle = ar ? 'بوابة التسجيل' : 'Registration Portal';
  const heroSubtitle = ar
    ? 'اختر نوع التسجيل، ثم أكمل النموذج المخصص خطوة بخطوة. يُعرض لك فقط ما يخص مسارك.'
    : 'Choose your category, then complete the tailored form step by step — you only ever see the fields your category needs.';

  if (submitState.result) {
    return (
      <>
        <PageHero
          title={heroTitle}
          subtitle={ar ? 'تم استلام طلبك بنجاح.' : 'Your request has been received.'}
          breadcrumb={[{ label: ar ? 'التسجيل' : 'Registration', to: '/registration' }, { label: ar ? 'تم الإرسال' : 'Submitted' }]}
        />
        <section className="section section--white">
          <div className="container container--narrow" ref={topRef}>
            <div className="regw-success">
              <div className="regw-success__icon" aria-hidden="true">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                  <path d="M20 7 10 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2>{ar ? 'تم استقبال الطلب بنجاح' : 'Request received'}</h2>
              <p>
                {ar
                  ? 'تم إرسال طلبك إلى الاتحاد السعودي للملاكمة التايلندية، وأُرسل إليك بريد إلكتروني يحمل الرقم المرجعي. سيتم إشعارك عند تحديث حالة الطلب.'
                  : 'Your request has been sent to the Saudi Muaythai Federation and a confirmation email carrying your reference number is on its way. You will be notified whenever its status changes.'}
              </p>
              <div className="regw-reference">
                <small>{ar ? 'الرقم المرجعي للطلب' : 'Request reference number'}</small>
                <strong dir="ltr">{submitState.result.referenceNumber}</strong>
              </div>
              <p className="regw-success__status">
                {ar ? 'الحالة الحالية:' : 'Current status:'}{' '}
                <strong>{ar ? submitState.result.statusLabelAr : submitState.result.statusLabelEn}</strong>
              </p>
              <div className="regw-success__actions">
                <Link to="/registration" className="btn btn--green">{ar ? 'العودة لأنواع التسجيل' : 'Back to registration types'}</Link>
                <Link to="/" className="btn btn--outline">{ar ? 'الصفحة الرئيسية' : 'Home'}</Link>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHero
        title={heroTitle}
        subtitle={heroSubtitle}
        breadcrumb={[
          { label: ar ? 'التسجيل' : 'Registration', to: '/registration' },
          { label: typeMeta ? (ar ? typeMeta.label.ar : typeMeta.label.en) : ar ? 'نموذج جديد' : 'New request' },
        ]}
      />

      <section className="section section--white">
        <div className="container container--narrow" ref={topRef}>
          <div className="regw">
            {/* progress + step tabs */}
            <div className="regw__head">
              <div className="regw__progress">
                <span>{ar ? 'اكتمال النموذج' : 'Form progress'}</span>
                <div className="regw__track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                  <div className="regw__bar" style={{ inlineSize: `${progress}%` }} />
                </div>
                <span>{progress}%</span>
              </div>

              <nav className="regw__steps" aria-label={ar ? 'خطوات التسجيل' : 'Registration steps'}>
                {STEPS.map((entry, index) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={`regw__step${index === step ? ' is-active' : ''}${index < step ? ' is-done' : ''}`}
                    onClick={() => {
                      if (index <= step) {
                        goToStep(index);
                      } else if (!type) {
                        flash(ar ? 'اختر نوع التسجيل أولاً.' : 'Choose a registration category first.');
                      } else if (Object.keys(currentErrors).length > 0) {
                        setShowErrors(true);
                        flash(ar ? 'يرجى استكمال الحقول المطلوبة.' : 'Please complete the required fields.');
                      } else {
                        goToStep(index);
                      }
                    }}
                    aria-current={index === step ? 'step' : undefined}
                  >
                    <span className="regw__step-num">{index < step ? '✓' : index + 1}</span>
                    {ar ? entry.label.ar : entry.label.en}
                  </button>
                ))}
              </nav>
            </div>

            <form
              className="regw__body"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                validateAndAdvance();
              }}
            >
              {/* STEP 1 — category */}
              {step === 0 && (
                <>
                  <header className="regw__section-title">
                    <h2>{ar ? 'اختر نوع التسجيل' : 'Choose your registration category'}</h2>
                    <p>
                      {ar
                        ? 'سيعرض النموذج فقط البيانات والمرفقات المرتبطة بنوع التسجيل الذي تختاره.'
                        : 'The form will only show the data and documents relevant to the category you choose.'}
                    </p>
                  </header>

                  <div className="regw-types">
                    {REGISTRATION_TYPES.map((entry) => (
                      <label key={entry.key} className={`regw-type${type === entry.key ? ' is-selected' : ''}`}>
                        <input
                          type="radio"
                          name="registrationType"
                          value={entry.key}
                          checked={type === entry.key}
                          onChange={() => chooseType(entry.key)}
                        />
                        <span className="regw-type__check" aria-hidden="true" />
                        <strong>{ar ? entry.label.ar : entry.label.en}</strong>
                        <p>{ar ? entry.blurb.ar : entry.blurb.en}</p>
                      </label>
                    ))}
                  </div>

                  <p className="registration-note" role="note">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                      <path d="M12 10v6M12 7.2v.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <span>
                      {ar
                        ? 'نماذج التعهد والإقرار والفحص الطبي تُطلب وقت البطولة فقط، ولا تُطلب في التسجيل العام.'
                        : 'The pledge, declaration, and medical examination forms are collected at competition time only — not during general registration.'}
                    </span>
                  </p>
                </>
              )}

              {/* STEPS 2–4 — declarative field sets */}
              {step > 0 && step < 4 && fieldSets && (
                <>
                  <header className="regw__section-title">
                    <h2>{ar ? STEPS[step].label.ar : STEPS[step].label.en}</h2>
                    <span className="regw__step-chip">
                      {ar ? `الخطوة ${step + 1} من ${STEPS.length}` : `Step ${step + 1} of ${STEPS.length}`}
                    </span>
                  </header>

                  <div className="regw-grid">
                    {stepFields(step).map((field) => (
                      <FieldControl
                        key={field.name}
                        field={field}
                        value={values[field.name]}
                        values={values}
                        error={(showErrors || touched[field.name]) ? currentErrors[field.name] : ''}
                        ar={ar}
                        onChange={update}
                        onBlur={markTouched}
                      />
                    ))}
                  </div>

                  {step === 1 && type === 'athlete' && age !== null && (
                    <p className="registration-note" role="note">
                      <span>
                        {minor
                          ? ar
                            ? `العمر المحتسب ${age} سنة — سيُطلب إدخال بيانات ولي الأمر وإرفاق موافقته في الخطوات التالية.`
                            : `Calculated age ${age} — guardian details and a signed consent will be required in the next steps.`
                          : ar
                            ? `العمر المحتسب ${age} سنة — لا حاجة لبيانات ولي الأمر.`
                            : `Calculated age ${age} — no guardian details needed.`}
                      </span>
                    </p>
                  )}

                  {step === 3 && type === 'athlete' && division && (
                    <p className="registration-note" role="note">
                      <span>
                        {ar
                          ? `وزن المنافسة المحتسب: ${division}. تُحدد الفئة التنافسية تلقائياً من العمر والوزن والجنس، ويراجعها الاتحاد قبل الاعتماد.`
                          : `Calculated competition division: ${division}. The competition category is derived from age, weight, and gender, and is reviewed by the federation before approval.`}
                      </span>
                    </p>
                  )}
                </>
              )}

              {/* STEP 5 — documents, review, declaration */}
              {step === 4 && type && (
                <>
                  <header className="regw__section-title">
                    <h2>{ar ? 'المرفقات والمراجعة النهائية' : 'Documents and final review'}</h2>
                    <p>
                      {ar
                        ? 'أرفق المستندات المطلوبة، ثم راجع الملخص قبل إرسال الطلب.'
                        : 'Attach the required documents, then review the summary before submitting.'}
                    </p>
                  </header>

                  <div className="regw-uploads">
                    {attachmentBlocks.map((block) => {
                      if (block.kind === 'group') {
                        const unsatisfied = attachmentError && missingKeys.has(`group:${block.group}`);
                        return (
                          <fieldset
                            key={`group-${block.group}`}
                            className={`regw-upload-group${unsatisfied ? ' is-error' : ''}`}
                          >
                            <legend className="regw-upload-group__legend">
                              {ar ? block.meta.label.ar : block.meta.label.en}
                              <span className="regw-req" aria-hidden="true"> *</span>
                            </legend>
                            <p className="regw-upload-group__hint">
                              {ar ? block.meta.hint.ar : block.meta.hint.en}
                            </p>
                            {block.slots.map((slot) => (
                              <UploadSlot
                                key={slot.key}
                                slot={slot}
                                entry={files[slot.key]}
                                required={false}
                                ar={ar}
                                onPick={pickFile}
                                onRemove={removeFile}
                              />
                            ))}
                            {unsatisfied && (
                              <p className="regw-error" role="alert">
                                {ar
                                  ? 'يجب إرفاق أحد المستندات المذكورة أعلاه.'
                                  : 'One of the documents above is required.'}
                              </p>
                            )}
                          </fieldset>
                        );
                      }

                      return (
                        <UploadSlot
                          key={block.slot.key}
                          slot={block.slot}
                          entry={files[block.slot.key]}
                          required={resolve(block.slot.required, values)}
                          invalid={Boolean(attachmentError) && missingKeys.has(block.slot.key)}
                          ar={ar}
                          onPick={pickFile}
                          onRemove={removeFile}
                        />
                      );
                    })}
                  </div>

                  <p className="regw-hint regw-hint--block">
                    {ar
                      ? `الصيغ المقبولة: JPG، PNG، WEBP، PDF — بحد أقصى ${MAX_FILE_LABEL.ar} لكل ملف. تُضغط الصور تلقائياً قبل الرفع.`
                      : `Accepted formats: JPG, PNG, WEBP, PDF — ${MAX_FILE_LABEL.en} maximum per file. Images are compressed automatically before upload.`}
                  </p>

                  {attachmentError && (
                    <p className="regw-error regw-error--block" role="alert">
                      {attachmentError}
                      {missingAttachments.length > 0 && (
                        <>
                          {' '}
                          {missingAttachments
                            .map((block) =>
                              block.kind === 'group'
                                ? ar ? block.meta.label.ar : block.meta.label.en
                                : ar ? block.slot.label.ar : block.slot.label.en,
                            )
                            .join('، ')}
                        </>
                      )}
                    </p>
                  )}

                  <div className="regw-review">
                    <div className="regw-review__head">
                      <strong>{ar ? 'ملخص الطلب' : 'Request summary'}</strong>
                      <button type="button" onClick={() => goToStep(1)}>{ar ? 'تعديل البيانات' : 'Edit details'}</button>
                    </div>
                    <dl className="regw-review__grid">
                      <div>
                        <dt>{ar ? 'نوع التسجيل' : 'Category'}</dt>
                        <dd>{ar ? typeMeta.label.ar : typeMeta.label.en}</dd>
                      </div>
                      {REVIEW_ROWS[type].map((row) => {
                        const allFields = [...fieldSets.identity, ...fieldSets.contact, ...fieldSets.details];
                        const text = row.from
                          .map((name) => {
                            const field = allFields.find((entry) => entry.name === name);
                            return field ? displayValue(field, values, ar) : values[name] || '';
                          })
                          .filter(Boolean)
                          .join(row.join ?? ' — ');
                        return (
                          <div key={row.label.en}>
                            <dt>{ar ? row.label.ar : row.label.en}</dt>
                            <dd>
                              {text || '—'}
                              {text && row.suffix ? ` ${ar ? row.suffix.ar : row.suffix.en}` : ''}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </div>

                  <label className={`regw-consent${consentError ? ' is-invalid' : ''}`}>
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => {
                        setConsent(event.target.checked);
                        if (event.target.checked) setConsentError(false);
                      }}
                    />
                    <span>
                      {ar
                        ? 'أقر بأن جميع البيانات المدخلة صحيحة، وأوافق على استخدام الاتحاد السعودي للملاكمة التايلندية لهذه البيانات لأغراض التسجيل والمراجعة والحوكمة الرياضية والتواصل المرتبط بالطلب وفق سياسة الخصوصية المعتمدة.'
                        : 'I confirm that all the details entered are correct, and I consent to the Saudi Muaythai Federation processing them for registration, review, sporting governance, and request-related contact under its published privacy policy.'}
                    </span>
                  </label>
                  {consentError && (
                    <p className="regw-error regw-error--block" role="alert">
                      {ar ? 'يجب الموافقة على الإقرار قبل إرسال الطلب.' : 'You must accept the declaration before submitting.'}
                    </p>
                  )}

                  {submitState.error && (
                    <p className="regw-error regw-error--block" role="alert">{submitState.error}</p>
                  )}
                </>
              )}

              <footer className="regw__footer">
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={() => goToStep(Math.max(0, step - 1))}
                  disabled={step === 0}
                >
                  {ar ? 'السابق' : 'Back'}
                </button>

                <span className="regw__footer-note">
                  {ar ? 'يُحفظ تقدّمك تلقائياً على هذا الجهاز.' : 'Your progress is saved automatically on this device.'}
                </span>

                <button type="submit" className="btn btn--green" disabled={submitState.loading}>
                  {step === STEPS.length - 1
                    ? submitState.loading
                      ? ar ? 'جارٍ الإرسال…' : 'Submitting…'
                      : ar ? 'إرسال الطلب' : 'Submit request'
                    : ar ? 'التالي' : 'Next'}
                </button>
              </footer>
            </form>
          </div>

          <p className="regw__foot-link">
            <Link to="/registration">{ar ? '← كل أنواع التسجيل' : '← All registration types'}</Link>
          </p>
        </div>
      </section>

      <div className={`regw-toast${notice ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </>
  );
}

function UploadSlot({ slot, entry, required, invalid, ar, onPick, onRemove }) {
  const inputId = `regw-file-${slot.key}`;
  const classes = [
    'regw-upload',
    entry?.status === 'done' ? 'is-done' : '',
    entry?.status === 'error' || invalid ? 'is-error' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <label htmlFor={inputId} className="regw-upload__label">
        <strong>
          {ar ? slot.label.ar : slot.label.en}
          {required ? <span className="regw-req" aria-hidden="true"> *</span> : null}
        </strong>
        {slot.hint && <span>{ar ? slot.hint.ar : slot.hint.en}</span>}
      </label>

      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_FILE_TYPES}
        onChange={(event) => {
          onPick(slot.key, event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {entry?.status === 'uploading' && (
        <span className="regw-upload__state">
          {ar ? 'جارٍ التجهيز والرفع…' : 'Preparing and uploading…'} {entry.progress ? `${entry.progress}%` : ''}
        </span>
      )}
      {entry?.status === 'done' && (
        <span className="regw-upload__state regw-upload__state--ok">
          ✓ {entry.fileName} <em>{formatBytes(entry.size)}</em>
          <button type="button" onClick={() => onRemove(slot.key)}>{ar ? 'إزالة' : 'Remove'}</button>
        </span>
      )}
      {entry?.status === 'error' && <span className="regw-upload__state regw-upload__state--bad">{entry.error}</span>}
    </div>
  );
}
