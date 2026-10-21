import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { usePageContent, useText } from '../../content/useContent';

export default function Committees() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('governance-committees');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />
        <div className="container page-hero__content">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'اللجان' : 'Committees'}</span>
          </nav>
          <span className="page-hero__tag">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
            {tx(c.hero.tag)}
          </span>
          <h1>{tx(c.hero.title)}</h1>
          {tx(c.hero.subtitle) && <p className="page-hero__sub">{tx(c.hero.subtitle)}</p>}
          <div className="page-hero__stats">
            {c.hero.stats.map((s, i) => (
              <div className="page-hero__stat" key={`${i}-${s.value}`}>
                <span className="page-hero__stat-value">{s.value}</span>
                <span className="page-hero__stat-label">{tx(s.label)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="governance-diagram">
        <div className="container governance-diagram__inner">
          <span className="governance-diagram__label">{tx(c.structure.label)}</span>
          <h2 className="governance-diagram__title">{tx(c.structure.title)}</h2>
          {tx(c.structure.subtitle) && <p className="governance-diagram__sub">{tx(c.structure.subtitle)}</p>}

          <div className="gov-structure">
            <div className="gov-tier">
              <div className="gov-box gov-box--president">{tx(c.structure.topBox)}</div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-connector"><div className="gov-connector-h" /></div>
            <div className="gov-tier">
              {/*
               * TXT-29 — names only. The member listing this page used to render
               * was removed at the federation's request, so the committee list in
               * the content carries names only — no chairs or members.
               */}
              {c.structure.committees.map((committee, i) => (
                <div className="gov-box gov-box--committee" key={`${i}-${committee.name.en}`}>{tx(committee.name)}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TXT-29 — the "اللجان الدائمة" (Standing Committees) team listing under
          "الهيكل التنظيمي" was removed at the federation's request, in both
          languages. The committees themselves still appear by name in the
          structure diagram above; their individual members no longer do. */}
    </>
  );
}
