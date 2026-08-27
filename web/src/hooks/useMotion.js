import { useEffect } from 'react';

const REDUCED = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.(REDUCED).matches;
}

/**
 * Blocks that should animate in. Tagged automatically so pages stay free of
 * presentation attributes — add a selector here and the whole site picks it up.
 * Children of a grid get a staggered delay so rows cascade rather than pop.
 */
const REVEAL_TARGETS = [
  { selector: '.section-header, .s-header, .section__header', stagger: 0 },
  { selector: '.about-card, .initiative-card, .goal-card-v2, .pillar-card-v2', stagger: 70 },
  { selector: '.fed-nav-card, .reg-card, .reg-card-v2, .news-card, .hp-event-card', stagger: 70 },
  { selector: '.committee-v2, .board-card, .staff-card, .saudi-games-card', stagger: 45 },
  { selector: '.recognition-card, .trust-card, .medal-item, .limb-card', stagger: 80 },
  { selector: '.timeline__item, .roadmap-v2-item, .wb-process__step, .step-v2', stagger: 60 },
  { selector: '.vm-card, .gov-pillar-card, .pillar-v2, .achievement-year-block', stagger: 70 },
  { selector: '.history-quote, .values-ifma, .wb-confidentiality, .achievement-highlight-box', stagger: 0 },
  { selector: '.strategy-kpi, .kpi-card-v3, .reg-hero__num', stagger: 60 },
];

/** Marks eligible elements with data-reveal + a stagger delay, once. */
function tagRevealTargets() {
  REVEAL_TARGETS.forEach(({ selector, stagger }) => {
    document.querySelectorAll(selector).forEach((el) => {
      if (el.hasAttribute('data-reveal')) return;
      el.setAttribute('data-reveal', '');
      if (!stagger) return;
      // Index within the element's own parent keeps each row's cascade local.
      const index = Array.prototype.indexOf.call(el.parentElement?.children ?? [], el);
      const capped = Math.min(index, 6); // don't let long lists drift too late
      el.style.setProperty('--reveal-delay', `${capped * stagger}ms`);
    });
  });
}

/**
 * Reveals `[data-reveal]` elements as they scroll into view.
 *
 * Re-scans whenever `key` changes (route navigation) and after async content
 * lands, so API-driven cards animate too. Elements already on screen at mount
 * are revealed immediately rather than waiting for a scroll.
 */
export function useScrollReveal(key) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const nodes = () => {
      tagRevealTargets();
      return Array.from(document.querySelectorAll('[data-reveal]:not(.is-revealed)'));
    };

    // Reduced motion: show everything, skip the observer entirely.
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      nodes().forEach((el) => el.classList.add('is-revealed'));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );

    const observeAll = () => nodes().forEach((el) => observer.observe(el));
    observeAll();

    // Catch cards rendered after a fetch resolves.
    const mutation = new MutationObserver(observeAll);
    mutation.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutation.disconnect();
    };
  }, [key]);
}

/**
 * Animates `.kpi-counter` elements from 0 up to their `data-count-to` value
 * (falling back to their rendered text) the first time they become visible.
 * Preserves any thousands separators in the original string.
 */
export function useCountUp(key) {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const counters = Array.from(document.querySelectorAll('.kpi-counter:not([data-counted])'));
    if (!counters.length) return undefined;

    const finalise = (el, text) => {
      el.textContent = text;
      el.setAttribute('data-counted', 'true');
    };

    if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
      counters.forEach((el) => finalise(el, el.dataset.countTo ?? el.textContent));
      return undefined;
    }

    const run = (el) => {
      const raw = (el.dataset.countTo ?? el.textContent ?? '').trim();
      const target = Number(raw.replace(/[^0-9.]/g, ''));
      if (!Number.isFinite(target) || target === 0) {
        finalise(el, raw);
        return;
      }

      const grouped = raw.includes(',');
      const duration = 1400;
      const start = performance.now();
      el.setAttribute('data-counted', 'true');

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        // easeOutExpo — fast start, gentle settle.
        const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
        const value = Math.round(target * eased);
        el.textContent = grouped ? value.toLocaleString('en-US') : String(value);
        if (progress < 1) requestAnimationFrame(tick);
        else el.textContent = raw;
      };

      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          run(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.4 },
    );

    counters.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);
}
