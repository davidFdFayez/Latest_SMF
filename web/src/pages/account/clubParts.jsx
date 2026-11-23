import { useEffect, useRef } from 'react';
import { IconPerson } from '../../components/icons/Icons';

/* Pieces every Club Account section shares, so they all read the same. */

/**
 * The section's heading, with an optional quiet status line under it and an
 * optional action at the far end.
 */
export function SectionTitle({ Icon, title, note, action }) {
  return (
    <header className="club-dash__title">
      <Icon className="club-dash__title-icon" />
      <div className="club-dash__title-text">
        <h2>{title}</h2>
        {note}
      </div>
      {action && <div className="club-dash__title-action">{action}</div>}
    </header>
  );
}

export function Empty({ Icon, title, text }) {
  return (
    <div className="club-empty">
      <Icon className="club-empty__icon" />
      {title && <strong className="club-empty__title">{title}</strong>}
      <p>{text}</p>
    </div>
  );
}

/** A member's photo, or a neutral silhouette when there is none. */
export function Avatar({ url, size = 'md' }) {
  return (
    <span className={`club-avatar club-avatar--${size}`}>
      {url ? <img src={url} alt="" loading="lazy" /> : <IconPerson className="club-avatar__icon" aria-hidden="true" />}
    </span>
  );
}

/** A small status pill: pending, accepted, open, and so on. */
export function Pill({ tone = 'neutral', children }) {
  return <span className={`club-pill club-pill--${tone}`}>{children}</span>;
}

/**
 * A dialog over the account page. Escape and the backdrop close it; focus
 * goes to the first field when it opens.
 */
export function Modal({ title, onClose, children }) {
  const panel = useRef(null);
  // The latest close handler, so the effect below runs once, on opening, and
  // never pulls focus back while someone is typing.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    panel.current?.querySelector('input, button, textarea, select')?.focus();
    const onKey = (event) => event.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="club-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="club-modal__panel" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <h3 className="club-modal__title">{title}</h3>
        {children}
      </div>
    </div>
  );
}
