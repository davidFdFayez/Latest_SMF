import { useLang } from '../../context/LanguageContext';
import PageHero from '../../components/PageHero';

const ITEMS = [
  { ar: 'قفازات', en: 'Gloves' },
  { ar: 'واقي الرأس', en: 'Head guard' },
  { ar: 'واقي الجسم', en: 'Body protector' },
  { ar: 'شورت المواي تاي', en: 'Muaythai shorts' },
  { ar: 'واقي الساق', en: 'Shin guards' },
  { ar: 'واقي الفم', en: 'Mouth guard' },
];

export default function AboutEquipment() {
  const { lang } = useLang();
  const ar = lang === 'ar';
  return (
    <>
      <PageHero
        title={ar ? 'معدات المواي تاي ومتطلبات التجهيز' : 'Muaythai Equipment Requirements'}
        subtitle={ar ? 'الدليل التفصيلي قيد الإعداد — هذه نظرة عامة على الفئات الأساسية.' : 'Detailed guide coming soon — overview of core equipment categories.'}
        breadcrumb={[
          { label: ar ? 'عن المواي تاي' : 'About Muaythai', to: '/about-muaythai/history' },
          { label: ar ? 'المعدات' : 'Equipment' },
        ]}
      />
      <section className="section--white">
        <div className="container">
          <div className="fed-hub__grid">
            {ITEMS.map((i) => (
              <article key={i.en} className="fed-nav-card">
                <div className="fed-nav-card__title">{ar ? i.ar : i.en}</div>
              </article>
            ))}
          </div>
          <p className="s-sub" style={{ textAlign: 'center', marginTop: '2rem' }}>
            <a href="https://muaythai.sport/" target="_blank" rel="noopener noreferrer">
              IFMA Equipment Catalog
            </a>
          </p>
        </div>
      </section>
    </>
  );
}
