import { Link, useParams } from 'react-router-dom';
import { useLang } from '../context/LanguageContext';
import PageHero from '../components/PageHero';

export default function Placeholder({ section = 'coming' }) {
  const { page } = useParams();
  const { lang } = useLang();
  const ar = lang === 'ar';

  const titles = {
    governance: ar ? 'الحوكمة' : 'Governance',
    about: ar ? 'عن المواي تاي' : 'About Muaythai',
    notfound: ar ? 'الصفحة غير موجودة' : 'Page not found',
    coming: ar ? 'قريباً' : 'Coming soon',
  };

  return (
    <>
      <PageHero
        title={titles[section] || titles.coming}
        subtitle={page ? `${page}` : (ar ? 'هذه الصفحة قيد التطوير وستكون متاحة قريباً.' : 'This page is under development and will be available soon.')}
        breadcrumb={[{ label: titles[section] || titles.coming }]}
      />
      <section className="section--white">
        <div className="container" style={{ textAlign: 'center', padding: '3rem 0' }}>
          <p className="s-sub" style={{ marginBottom: '1.5rem' }}>
            {ar ? 'يمكنك في الوقت الحالي استكشاف أقسام الاتحاد المتاحة.' : 'Meanwhile, you can explore the available federation sections.'}
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/" className="btn btn--green">{ar ? 'الرئيسية' : 'Home'}</Link>
            <Link to="/organization/overview" className="btn btn--primary">{ar ? 'نظرة عامة' : 'Overview'}</Link>
            <Link to="/contact" className="btn btn--outline">{ar ? 'تواصل معنا' : 'Contact'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
