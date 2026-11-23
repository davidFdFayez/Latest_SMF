import { useMemo } from 'react';
import { hasRichText, sanitizeRichText } from '../../utils/richText';

/**
 * Terms & Conditions: the formatted text the federation wrote for this
 * tournament, in one white card under the section heading — headings,
 * paragraphs and lists, no per-item cards or decoration. The page's own
 * language comes first; when only the other language was written, that is
 * shown instead, in its own direction.
 */
export default function TournamentTerms({ termsAr, termsEn, ar }) {
  const pick = (arabic, english) => (ar ? arabic : english);
  const own = ar ? termsAr : termsEn;
  const other = ar ? termsEn : termsAr;
  const [text, dir] = hasRichText(own) ? [own, ar ? 'rtl' : 'ltr'] : hasRichText(other) ? [other, ar ? 'ltr' : 'rtl'] : ['', null];
  const html = useMemo(() => sanitizeRichText(text), [text]);

  return (
    <section className="tsection tterms" aria-labelledby="tterms-title">
      <h2 id="tterms-title" className="tsection__title">{pick('الشروط والأحكام', 'Terms & Conditions')}</h2>
      <div className="tpage-card tterms__card">
        {hasRichText(html) ? (
          <div
            className="tterms__body"
            dir={dir}
            lang={dir === 'rtl' ? 'ar' : 'en'}
            // Cleaned by the server when saved and again by sanitizeRichText above.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="tsection__empty">
            {pick('لم تُنشر الشروط والأحكام لهذه البطولة بعد.', 'Terms & Conditions have not been published for this tournament yet.')}
          </p>
        )}
      </div>
    </section>
  );
}
