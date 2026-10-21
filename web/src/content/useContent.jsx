import { Fragment, useCallback, useEffect, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';
import { useLang } from '../context/LanguageContext';
import './content.css';

/**
 * Website content edited in the admin console (see ContentCatalog on the API).
 *
 * Content is fetched once per page load per key and kept in localStorage, so a
 * returning visitor sees the page instantly — and still sees it if the API is
 * briefly unreachable — while the fresh copy loads behind it.
 */

const STORAGE_PREFIX = 'smf_content_v1:';

/** key -> { content, status }; replaced (never mutated) so snapshots stay stable. */
const store = new Map();
const listeners = new Map();
/** Keys already fetched, or being fetched, during this page load. */
const requested = new Set();

function readCached(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function entryFor(key) {
  let entry = store.get(key);
  if (!entry) {
    entry = { content: readCached(key), status: 'idle' };
    store.set(key, entry);
  }
  return entry;
}

function update(key, patch) {
  store.set(key, { ...entryFor(key), ...patch });
  listeners.get(key)?.forEach((notify) => notify());
}

function subscribe(key, notify) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(notify);
  return () => listeners.get(key)?.delete(notify);
}

/** Fetches several keys in one request. Keys already requested this page load are skipped unless forced. */
export function preloadContent(keys, { force = false } = {}) {
  const pending = keys.filter((key) => force || !requested.has(key));
  if (pending.length === 0) return Promise.resolve();

  pending.forEach((key) => {
    requested.add(key);
    update(key, { status: 'loading' });
  });

  return client
    .get('/api/content', { params: { keys: pending.join(',') } })
    .then(({ data }) => {
      pending.forEach((key) => {
        const content = data?.[key];
        if (!content) {
          update(key, { status: 'error' });
          return;
        }
        try {
          localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(content));
        } catch {
          // Storage full or disabled — the in-memory copy still works.
        }
        update(key, { content, status: 'ready' });
      });
    })
    .catch(() => {
      pending.forEach((key) => {
        requested.delete(key);
        update(key, { status: 'error' });
      });
    });
}

/** `{ content, status, retry }` for one content key. `content` is null until loaded. */
export function useContent(key) {
  const subscribeToKey = useCallback((notify) => subscribe(key, notify), [key]);
  const entry = useSyncExternalStore(subscribeToKey, () => entryFor(key));

  useEffect(() => {
    preloadContent([key]);
  }, [key]);

  const retry = useCallback(() => preloadContent([key], { force: true }), [key]);

  return { content: entry.content, status: entry.status, retry };
}

/**
 * For a page built from one content key.
 *
 *   const { content: c, fallback } = usePageContent('organization-values');
 *   const tx = useText();
 *   if (!c) return fallback;
 *
 * `fallback` is the loading placeholder, or a retry message if the content
 * could not be fetched and nothing is cached.
 */
export function usePageContent(key) {
  const { content, status, retry } = useContent(key);
  const { lang } = useLang();
  const ar = lang === 'ar';

  let fallback = null;
  if (!content && status === 'error') {
    fallback = (
      <section className="section--white">
        <div className="container content-state">
          <h1 className="content-state__title">{ar ? 'تعذر تحميل الصفحة' : 'This page could not be loaded'}</h1>
          <p>{ar ? 'يرجى التحقق من الاتصال والمحاولة مرة أخرى.' : 'Please check your connection and try again.'}</p>
          <button type="button" className="btn btn--green" onClick={retry}>
            {ar ? 'إعادة المحاولة' : 'Try again'}
          </button>
        </div>
      </section>
    );
  } else if (!content) {
    fallback = (
      <div className="content-state content-state--loading" role="status" aria-live="polite">
        <span className="content-state__spinner" aria-hidden="true" />
        <span className="sr-only">{ar ? 'جاري التحميل…' : 'Loading…'}</span>
      </div>
    );
  }

  return { content, fallback };
}

/** The current-language string of a `{ ar, en }` value. Plain strings pass through. */
export function pickText(value, lang) {
  if (value == null) return '';
  if (typeof value !== 'object') return String(value);
  return value[lang] ?? '';
}

/** `tx(value)` — pickText bound to the current language. */
export function useText() {
  const { lang } = useLang();
  return useCallback((value) => pickText(value, lang), [lang]);
}

/** Renders text keeping the editor's line breaks. */
export function MultilineText({ text }) {
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 && <br />}
      {line}
    </Fragment>
  ));
}

/**
 * A link whose target comes from content: site pages route in-app; anything
 * else — https, mailto, tel, and files (uploads under /api/, anything under
 * /assets/, or any path ending in a file extension) — is a plain anchor, with
 * web addresses and files opening in a new tab.
 */
export function SmartLink({ to, children, ...rest }) {
  const href = String(to ?? '');
  const isFile = href.startsWith('/api/') || href.startsWith('/assets/') || /\.[a-z0-9]{2,5}(?:[?#].*)?$/i.test(href);
  if (href.startsWith('/') && !href.startsWith('//') && !isFile) {
    return <Link to={href} {...rest}>{children}</Link>;
  }
  const external = /^https?:\/\//i.test(href) || isFile;
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...rest}>
      {children}
    </a>
  );
}
