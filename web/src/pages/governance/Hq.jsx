import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';
import Avatar from '../../components/Avatar';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

function StarIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  );
}

export default function Hq() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('governance-hq');
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
            <span>{ar ? 'المقر الرئيسي' : 'Federation HQ'}</span>
          </nav>
          <span className="page-hero__tag">
            <StarIcon />
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
              <div className="gov-box gov-box--president">{tx(c.structure.presidentBox)}</div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-tier">
              <div className="gov-box gov-box--board gov-box--board-solo">{tx(c.structure.boardBox)}</div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-connector"><div className="gov-connector-h" /></div>
            <div className="gov-tier">
              <div className="gov-box gov-box--ceo">{tx(c.structure.ceoBox)}</div>
              <div className="gov-box gov-box--committees-branch">{tx(c.structure.committeesBox)}</div>
            </div>
            <div className="gov-connector"><span className="gov-connector-v" /></div>
            <div className="gov-tier">
              {c.structure.departments.map((d, i) => (
                <div className="gov-box gov-box--committee" key={`${i}-${d.name.en}`}>{tx(d.name)}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{tx(c.president.label)}</span>
            <h2>{tx(c.president.heading)}</h2>
          </div>

          <div className="president-hero">
            <div className="president-hero__inner">
              <div className="president-hero__photo">
                <Avatar
                  size="xl"
                  variant="gold"
                  name={tx(c.president.monogramName)}
                  src={c.president.photo || undefined}
                />
              </div>
              <div>
                <span className="president-hero__badge">
                  <StarIcon />
                  {tx(c.president.badge)}
                </span>
                <p className="president-hero__name">{tx(c.president.name)}</p>
                {tx(c.president.rolePrimary) && (
                  <p className="president-hero__role president-hero__role--primary">{tx(c.president.rolePrimary)}</p>
                )}
                {tx(c.president.roleSecondary) && (
                  <p className="president-hero__role">{tx(c.president.roleSecondary)}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.ceo.label)}</span>
            <h2>{tx(c.ceo.heading)}</h2>
          </div>

          <div className="exec-card">
            <div className="exec-card__photo">
              <Avatar size="lg" name={tx(c.ceo.monogramName)} src={c.ceo.photo || undefined} />
            </div>
            <div>
              {tx(c.ceo.department) && <p className="exec-card__dept">{tx(c.ceo.department)}</p>}
              <p className="exec-card__name">{tx(c.ceo.name)}</p>
              {tx(c.ceo.role) && <p className="exec-card__role">{tx(c.ceo.role)}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{tx(c.board.label)}</span>
            <h2>{tx(c.board.heading)}</h2>
            {tx(c.board.intro) && <p>{tx(c.board.intro)}</p>}
          </div>

          <div className="board-grid">
            {c.board.members.map((b, i) => (
              <div className="board-card" key={`${i}-${b.name.en}`}>
                <div className="board-card__photo">
                  <Avatar size="md" name={tx(b.name)} src={b.photo || undefined} />
                </div>
                <p className="board-card__role">{tx(c.board.memberRole)}</p>
                <p className="board-card__name">{tx(b.name)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TXT-27 / TXT-40 — the "الكوادر الإدارية والتشغيلية" (Administrative &
          Operational Team) section was removed at the federation's request, in
          both languages. The departments still appear in the governance chart
          above; the named staff listing does not. */}
      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{tx(c.technical.label)}</span>
            <h2>{tx(c.technical.heading)}</h2>
            {tx(c.technical.intro) && <p>{tx(c.technical.intro)}</p>}
          </div>

          <div className="staff-grid staff-grid--two-col">
            {c.technical.staff.map((s, i) => (
              <div className={`staff-card${s.vacant ? ' staff-card--coming-soon staff-card--featured' : ''}`} key={`${i}-${s.role.en}`}>
                <div className="staff-card__photo">
                  <Avatar
                    size="sm"
                    variant={s.vacant ? 'charcoal' : 'green'}
                    name={s.vacant ? '' : tx(s.name)}
                    src={s.photo || undefined}
                  />
                </div>
                <div className="staff-card__info">
                  <p className={`staff-card__name${s.vacant ? ' staff-card__name--vacant' : ''}`}>{tx(s.name)}</p>
                  <p className="staff-card__role">{tx(s.role)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">{tx(c.cta.text)}</p>
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
