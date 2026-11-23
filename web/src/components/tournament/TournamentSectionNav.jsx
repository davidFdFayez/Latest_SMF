import { useLayoutEffect, useRef, useState } from 'react';
import { TOURNAMENT_SECTIONS } from './sections';

/**
 * The tournament page's sections as a quiet row of tabs: labels with small
 * green icons, thin separators and a light baseline. The chosen tab turns
 * green, lifts a few pixels, and one green underline slides beneath it.
 * On a narrow screen the row scrolls sideways instead of wrapping.
 */
export default function TournamentSectionNav({ active, onChange, ar }) {
  const list = useRef(null);
  const [ink, setInk] = useState(null);

  // The underline follows the chosen tab, and its size when the row reflows.
  useLayoutEffect(() => {
    const row = list.current;
    if (!row) return undefined;
    const place = () => {
      const tab = row.querySelector(`#tpage-tab-${active}`);
      if (!tab) return;
      setInk((prev) => {
        const next = { left: tab.offsetLeft, width: tab.offsetWidth };
        return prev && prev.left === next.left && prev.width === next.width ? prev : { ...next, ready: Boolean(prev) };
      });
    };
    place();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    observer?.observe(row);
    document.fonts?.ready.then(place);
    return () => observer?.disconnect();
  }, [active]);

  function choose(key) {
    onChange(key);
    // Keep the chosen tab in view when the row scrolls, without moving the page.
    const tab = document.getElementById(`tpage-tab-${key}`);
    const scroller = list.current?.parentElement;
    if (tab && scroller && scroller.scrollWidth > scroller.clientWidth) {
      const box = tab.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      if (box.left < view.left) scroller.scrollBy({ left: box.left - view.left - 16, behavior: 'smooth' });
      else if (box.right > view.right) scroller.scrollBy({ left: box.right - view.right + 16, behavior: 'smooth' });
    }
  }

  function onKeyDown(event, index) {
    // Arrow keys move between the tabs, following the reading direction.
    const forward = ar ? 'ArrowLeft' : 'ArrowRight';
    const back = ar ? 'ArrowRight' : 'ArrowLeft';
    if (event.key !== forward && event.key !== back) return;
    event.preventDefault();
    const next = (index + (event.key === forward ? 1 : -1) + TOURNAMENT_SECTIONS.length) % TOURNAMENT_SECTIONS.length;
    choose(TOURNAMENT_SECTIONS[next].key);
    document.getElementById(`tpage-tab-${TOURNAMENT_SECTIONS[next].key}`)?.focus();
  }

  return (
    <nav className="tpage-nav" aria-label={ar ? 'أقسام البطولة' : 'Tournament sections'}>
      <div className="tpage-nav__list" role="tablist" ref={list}>
        {TOURNAMENT_SECTIONS.map(({ key, ar: labelAr, en, Icon }, index) => (
          <button
            key={key}
            id={`tpage-tab-${key}`}
            type="button"
            role="tab"
            aria-selected={active === key}
            aria-controls={`tpage-panel-${key}`}
            tabIndex={active === key ? 0 : -1}
            className={`tpage-nav__tab${active === key ? ' is-active' : ''}`}
            onClick={() => choose(key)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className="tpage-nav__label">
              <Icon className="tpage-nav__icon" aria-hidden="true" />
              <span>{ar ? labelAr : en}</span>
            </span>
          </button>
        ))}
        {ink && (
          <span
            className={`tpage-nav__ink${ink.ready ? ' is-ready' : ''}`}
            style={{ width: ink.width, transform: `translateX(${ink.left}px)` }}
            aria-hidden="true"
          />
        )}
      </div>
    </nav>
  );
}
