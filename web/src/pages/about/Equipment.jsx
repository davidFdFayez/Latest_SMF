import { useLang } from '../../context/LanguageContext';
import PageHero from '../../components/PageHero';
import { SmartLink, usePageContent, useText } from '../../content/useContent';

export default function AboutEquipment() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  const { content: c, fallback } = usePageContent('about-equipment');
  const tx = useText();

  if (!c) return fallback;

  return (
    <>
      <PageHero
        title={tx(c.header.title)}
        subtitle={tx(c.header.subtitle)}
        breadcrumb={[
          { label: ar ? 'عن المواي تاي' : 'About Muaythai', to: '/about-muaythai/history' },
          { label: ar ? 'المعدات' : 'Equipment' },
        ]}
      />
      <section className="section--white">
        <div className="container">
          <div className="fed-hub__grid">
            {c.equipment.items.map((item, i) => (
              <article key={`${i}-${item.name?.en}`} className="fed-nav-card">
                <div className="fed-nav-card__title">{tx(item.name)}</div>
              </article>
            ))}
          </div>
          {c.equipment.catalogueUrl && (
            <p className="s-sub" style={{ textAlign: 'center', marginTop: '2rem' }}>
              <SmartLink to={c.equipment.catalogueUrl}>
                {tx(c.equipment.catalogueLabel)}
              </SmartLink>
            </p>
          )}
        </div>
      </section>
    </>
  );
}
