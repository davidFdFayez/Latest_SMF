import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

export default function Reports() {
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
            <span>{ar ? 'التقارير' : 'Reports'}</span>
          </nav>
          <h1>{ar ? 'التقارير والوثائق الرسمية' : 'Official Reports & Documents'}</h1>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="coming-soon-block">
            <div className="coming-soon-block__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>

            <div className="coming-soon-block__badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {ar ? 'قريباً' : 'Coming Soon'}
            </div>

            <h2 className="coming-soon-block__title">{ar ? 'التقارير والوثائق' : 'Reports & Documents'}</h2>

            <p className="coming-soon-block__text">
              {ar
                ? 'تُعدّ التقارير والوثائق الرسمية للاتحاد وستُتاح للعموم فور اعتمادها من الجهات المختصة. يلتزم الاتحاد السعودي للملاكمة التايلندية بأعلى معايير الشفافية المؤسسية.'
                : 'Official federation reports and documents are being prepared and will be made publicly available upon formal approval from the relevant authorities. SMF is committed to the highest standards of institutional transparency.'}
            </p>

            <Link to="/" className="btn btn--outline-dark">{ar ? 'العودة للرئيسية' : 'Back to Home'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
