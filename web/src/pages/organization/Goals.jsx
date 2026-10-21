import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

/* Inline icons matching the live goal cards. */
function IconShield() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconClockSm() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCheckSm() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconChevronSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export default function Goals() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-goals');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الأهداف' : 'Our Goals'}</span>
          </nav>
          <h1>{tx(c.header.title)}</h1>
          <p>
            {tx(c.header.subtitle)}
          </p>
        </div>
      </section>

      {/* Framework bridge: Pillars → Initiatives → Goals */}
      <section className="section--white">
        <div className="container">
          <div className="goals-framework">
            <div className="goals-framework__item">
              <Link to="/organization/values" className="goals-framework__link">
                <span className="goals-framework__num">{c.framework.pillarsNumber}</span>
                <span className="goals-framework__label">{tx(c.framework.pillarsLabel)}</span>
                <IconChevronSm />
              </Link>
            </div>
            <div className="goals-framework__arrow" aria-hidden="true">›</div>
            <div className="goals-framework__item">
              <Link to="/organization/initiatives" className="goals-framework__link">
                <span className="goals-framework__num">{c.framework.initiativesNumber}</span>
                <span className="goals-framework__label">{tx(c.framework.initiativesLabel)}</span>
                <IconChevronSm />
              </Link>
            </div>
            <div className="goals-framework__arrow" aria-hidden="true">›</div>
            <div className="goals-framework__item goals-framework__item--current">
              <span className="goals-framework__num">{c.framework.goalsNumber}</span>
              <span className="goals-framework__label">{tx(c.framework.goalsLabel)}</span>
            </div>
          </div>

          <p className="values-intro">
            {tx(c.intro)}
          </p>
        </div>
      </section>

      {/*
        Officially approved goals (§2 of the federation's content requirements),
        verbatim from the final content requirements. These are the charter-level
        goals; the seven strategic goals below are the roadmap that delivers them.
      */}
      <section className="section--white">
        <div className="container container--narrow">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.approved.label)}</span>
            <h2>{tx(c.approved.heading)}</h2>
          </div>
          <ul className="goal-card-v2__list">
            {c.approved.items.map((g, i) => (
              <li key={`${i}-${tx(g.text)}`}>{tx(g.text)}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Goals */}
      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.goals.label)}</span>
            <h2>{tx(c.goals.heading)}</h2>
          </div>

          <div className="goals-grid-v2">
            {c.goals.items.map((g, i) => (
              <div className="goal-card-v2" key={`${i}-${g.number}`}>
                <div className="goal-card-v2__head">
                  <span className="goal-card-v2__num">{g.number}</span>
                  <div className="goal-card-v2__meta">
                    <div className="goal-card-v2__pillar-tag">
                      <IconShield />
                      {tx(g.pillarTag)}
                    </div>
                    <div className="goal-card-v2__init-tag">
                      <IconClockSm />
                      {tx(g.initiativeTag)}
                    </div>
                  </div>
                </div>
                <h3>{tx(g.title)}</h3>
                <p className="goal-card-v2__summary">{tx(g.summary)}</p>
                <ul className="goal-card-v2__list">
                  {(g.points ?? []).map((point, j) => (
                    <li key={`${j}-${tx(point.text)}`}>{tx(point.text)}</li>
                  ))}
                </ul>
                <div className="goal-card-v2__initiative">
                  <IconCheckSm />
                  <span>{`${tx(c.goals.keyInitiativeLabel)} `}</span>
                  {tx(g.keyInitiative)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pillars & Initiatives link bridge */}
      <section className="section--white">
        <div className="container values-ifma">
          <p className="values-ifma__text">
            {tx(c.bridge.text)}
          </p>
          <div className="values-cta__btns">
            {c.bridge.primaryUrl && (
              <SmartLink to={c.bridge.primaryUrl} className="btn btn--green">{tx(c.bridge.primaryLabel)}</SmartLink>
            )}
            {c.bridge.secondaryUrl && (
              <SmartLink to={c.bridge.secondaryUrl} className="btn btn--green">{tx(c.bridge.secondaryLabel)}</SmartLink>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">
            {tx(c.cta.text)}
          </p>
          <div className="values-cta__btns">
            {c.cta.primaryUrl && (
              <SmartLink to={c.cta.primaryUrl} className="btn btn--gold">{tx(c.cta.primaryLabel)}</SmartLink>
            )}
            {c.cta.secondaryUrl && (
              <SmartLink to={c.cta.secondaryUrl} className="btn btn--outline btn--outline-white">{tx(c.cta.secondaryLabel)}</SmartLink>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
