import { useEffect } from 'react';

/**
 * Observes `.smf-reveal` and `[data-reveal]` elements for scroll animations.
 */
export default function RevealObserver() {
  useEffect(() => {
    const selector = '.smf-reveal:not(.is-visible), [data-reveal]:not(.is-revealed)';
    const nodes = () => Array.from(document.querySelectorAll(selector));

    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll('.smf-reveal').forEach((el) => el.classList.add('is-visible'));
      document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          if (el.hasAttribute('data-reveal')) el.classList.add('is-revealed');
          if (el.classList.contains('smf-reveal')) el.classList.add('is-visible');
          io.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    const observeAll = () => nodes().forEach((el) => io.observe(el));
    observeAll();

    const mo = new MutationObserver(() => observeAll());
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);

  return null;
}

