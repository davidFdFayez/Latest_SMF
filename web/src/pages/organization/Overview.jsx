import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import { SmartLink, usePageContent, useText } from '../../content/useContent';
import { useSiteContent } from '../../content/site';

const ico = {
  width: '22',
  height: '22',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '1.8',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const IconEye = () => <svg {...ico}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>;
const IconShield = () => <svg {...ico}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
const IconUsers = () => <svg {...ico}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>;
const IconGlobe = () => <svg {...ico}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>;
const IconHome = () => <svg {...ico}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
const IconClock = () => <svg {...ico}><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const IconHeart = () => <svg {...ico}><path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>;
const IconChart = () => <svg {...ico}><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const IconMedal = () => <svg {...ico}><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>;
const IconBoard = () => <svg {...ico}><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;

/* One icon per governance pillar / section card, by position; extra items reuse them in turn. */
const PILLAR_ICONS = [IconShield, IconUsers, IconGlobe, IconHome];
const HUB_ICONS = [IconClock, IconHeart, IconChart, IconMedal, IconBoard, IconHome];

/* Card style chosen per pillar in the admin ("default" adds no modifier). */
const PILLAR_STYLES = {
  gold: ' gov-pillar-card--gold',
  charcoal: ' gov-pillar-card--charcoal',
};

export default function Overview() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('organization-overview');
  const tx = useText();
  const { site } = useSiteContent();

  if (!c) return fallback;

  return (
    <>
      <section className="page-hero">
        <div className="page-hero__bg" role="img" aria-label={ar ? 'الاتحاد السعودي للملاكمة التايلندية' : 'Saudi Muaythai Federation'} />
        <div className="page-hero__overlay" aria-hidden="true" />
        <div className="page-hero__accent" aria-hidden="true" />

        <div className="container page-hero__inner">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'نظرة عامة' : 'Overview'}</span>
          </nav>

          <div className="page-hero__content">
            <span className="section-label section-label--amber">
              {tx(c.hero.label)}
            </span>
            <h1 className="page-hero__title">{tx(c.hero.title)}</h1>
            <p className="page-hero__sub">
              {tx(c.hero.subtitle)}
            </p>

            <div className="hero-stats">
              {c.hero.stats.map((s, i) => (
                <div key={`${i}-${s.value}`} style={{ display: 'contents' }}>
                  {i > 0 && <div className="hero-stat__div" aria-hidden="true" />}
                  <div className="hero-stat">
                    <div className="hero-stat__val">{s.value}</div>
                    <div className="hero-stat__lbl">{tx(s.label)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="recognition-bar">
        <div className="container">
          <div className="recognition-bar__inner">
            <span className="recognition-bar__label">{tx(c.recognition.label)}</span>
            {(site?.partners ?? []).map((p, i) => (
              <img key={`${i}-${p.logo}`} src={p.logo} alt={tx(p.name)} loading="lazy" className="recognition-bar__logo" />
            ))}
          </div>
        </div>
      </div>

      <section className="section--white">
        <div className="container container--narrow">
          <p className="overview-intro">
            {tx(c.intro)}
          </p>
        </div>
      </section>

      <section className="vm-section">
        <div className="container">
          <div className="s-header s-header--center">
            <div className="s-label">{tx(c.identity.label)}</div>
            <h2 className="s-heading">{tx(c.identity.heading)}</h2>
          </div>
          <div className="vm-grid">
            <div className="vm-card">
              <div className="vm-card__icon"><IconEye /></div>
              <div>
                <div className="s-label">{tx(c.identity.visionLabel)}</div>
                <p className="vm-card__body">
                  {tx(c.identity.vision)}
                </p>
              </div>
            </div>
            <div className="vm-card vm-card--gold">
              <div className="vm-card__icon"><IconShield /></div>
              <div>
                <div className="s-label s-label--gold">{tx(c.identity.missionLabel)}</div>
                <p className="vm-card__body">
                  {tx(c.identity.mission)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="gov-pillars">
        <div className="container">
          <div className="s-header s-header--center">
            <div className="s-label">{tx(c.pillars.label)}</div>
            <h2 className="s-heading">{tx(c.pillars.heading)}</h2>
          </div>
          <div className="gov-pillars__grid">
            {c.pillars.items.map((p, i) => {
              const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length];
              return (
                <div key={`${i}-${tx(p.title)}`} className={`gov-pillar-card${PILLAR_STYLES[p.style] ?? ''}`}>
                  <div className="gov-pillar-card__icon"><Icon /></div>
                  <h3 className="gov-pillar-card__title">{tx(p.title)}</h3>
                  <p className="gov-pillar-card__body">{tx(p.body)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="fed-hub">
        <div className="container">
          <div className="s-header s-header--center">
            <div className="s-label">{tx(c.hub.label)}</div>
            <h2 className="s-heading">{tx(c.hub.heading)}</h2>
            {tx(c.hub.subtitle) && (
              <p className="s-sub">
                {tx(c.hub.subtitle)}
              </p>
            )}
          </div>
          <div className="fed-hub__grid">
            {c.hub.items.map((h, i) => {
              const Icon = HUB_ICONS[i % HUB_ICONS.length];
              return (
                <SmartLink key={`${i}-${tx(h.title)}`} to={h.url} className="fed-nav-card">
                  <div className="fed-nav-card__icon"><Icon /></div>
                  <div className="fed-nav-card__cat">{tx(h.category)}</div>
                  <div className="fed-nav-card__title">{tx(h.title)}</div>
                  <p className="fed-nav-card__desc">{tx(h.description)}</p>
                  <div className="fed-nav-card__arrow">{tx(c.hub.moreLabel)}</div>
                </SmartLink>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
