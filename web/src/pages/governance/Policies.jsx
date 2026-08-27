import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

export default function Policies() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/governance/recognition">{ar ? 'الحوكمة' : 'Governance'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'الأنظمة والسياسات' : 'Code & Policies'}</span>
          </nav>
          <h1>{ar ? 'الأنظمة والسياسات الرسمية' : 'Code & Policies'}</h1>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="coming-soon-block">
            <div className="coming-soon-block__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            <div className="coming-soon-block__badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {ar ? 'قريباً' : 'Coming Soon'}
            </div>

            <h2 className="coming-soon-block__title">{ar ? 'الأنظمة واللوائح والسياسات' : 'Code, Regulations & Policies'}</h2>

            <p className="coming-soon-block__text">
              {ar
                ? 'تُعدّ الوثائق التنظيمية والسياسات الرسمية للاتحاد وستُتاح للعموم فور اعتمادها. يعمل الاتحاد السعودي للملاكمة التايلندية وفق إطار حوكمة شامل يلتزم بأعلى المعايير الدولية.'
                : 'Federation regulatory documents and official policies are being prepared and will be made publicly available upon approval. SMF operates under a comprehensive governance framework aligned with the highest international standards.'}
            </p>

            <Link to="/" className="btn btn--outline-dark">{ar ? 'العودة للرئيسية' : 'Back to Home'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
