import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const TIMELINE = [
  {
    year: '2019',
    tagAr: 'تأسيس',
    tagEn: 'Foundation',
    titleAr: 'تأسيس الاتحاد والأولى دولياً',
    titleEn: 'Establishment & First International Medals',
    bodyAr: 'تأسّس الاتحاد السعودي للملاكمة التايلندية رسمياً تحت مظلة اللجنة الأولمبية والبارالمبية السعودية، برئاسة سمو الأمير فهد بن منصور بن سعد بن سعود آل سعود. وفي العام ذاته، مثّل المنتخب الوطني المملكة دولياً لأول مرة في بطولة "Chungju World Martial Arts Masterships" بكوريا الجنوبية، محققاً 3 ميداليات برونزية.',
    bodyEn: 'The Saudi Muaythai Federation (SMF) was officially established under the Saudi Olympic & Paralympic Committee (SOPC), with HRH Prince Fahad Bin Mansour Bin Saad Al Saud appointed as President. That same year, the national team made its international debut at the Chungju World Martial Arts Masterships in South Korea, winning 3 bronze medals.',
  },
  {
    year: '2020',
    tagAr: 'اعتراف دولي',
    tagEn: 'International Recognition',
    titleAr: 'أول بطولة وطنية والانضمام إلى IFMA',
    titleEn: 'First National Championship & IFMA Membership',
    bodyAr: 'أقام الاتحاد أول بطولة مملكة للمواي تاي، وفي ديسمبر 2020 انضم رسمياً إلى عائلة IFMA، مما أسّس لوجود سعودي راسخ في منظومة الحوكمة الدولية للرياضة.',
    bodyEn: 'SMF hosted the inaugural Kingdom Muaythai Championship, and in December 2020 achieved official IFMA membership, establishing Saudi Arabia within the highest tier of international Muaythai governance.',
  },
  {
    year: '2021',
    tagAr: 'شمولية',
    tagEn: 'Inclusion',
    titleAr: 'الشمولية والتوسع الدولي',
    titleEn: 'Inclusion & International Growth',
    bodyAr: 'أطلق الاتحاد أول بطولة نسائية حصرية وأول بطولة مختلطة في تاريخه. على الصعيد الدولي، حضر المنتخب بطولة العالم في بانكوك، حاصداً 1 فضية و2 برونزية.',
    bodyEn: 'SMF hosted its first women-only and first mixed-gender domestic championships. Internationally, the national team competed at the IFMA World Championships in Bangkok, securing 1 silver and 2 bronze medals.',
  },
  {
    year: '2022',
    tagAr: 'انطلاقة دولية',
    tagEn: 'International Breakthrough',
    titleAr: 'انطلاقة دولية — 20 ميدالية في موسم واحد',
    titleEn: 'International Breakthrough — 20 Medals in One Season',
    bodyAr: 'أكثر موسم دولي إنتاجاً حتى ذلك الحين: 20 ميدالية عبر ثلاث بطولات IFMA في كوالالمبور وأبوظبي — بما فيها 6 فضيات و14 برونزية في بطولات الشباب والكبار والغراند سلام. وأجرى الاتحاد أول استكشاف استراتيجي للمواهب.',
    bodyEn: 'The most productive international season to date: 20 medals across three IFMA events in Kuala Lumpur and Abu Dhabi — including 6 silver and 14 bronze at the Grand Slam, Youth Worlds, and Senior Worlds. SMF conducted its first strategic talent scouting exercise.',
  },
  {
    year: '2023',
    tagAr: 'ذهب عالمي',
    tagEn: 'World Gold',
    titleAr: 'أول ذهب عالمي — قيادة IFMA — استضافة الرياض',
    titleEn: 'First World Gold · IFMA Leadership · Riyadh Hosts WCG',
    bodyAr: 'هتان السف: أول رياضية سعودية تُحرز ذهبية في بطولة العالم للكبار (بانكوك). ألعاب القتال العالمية في الرياض: 3 ذهبيات (هتان، عناد، علي). عُيِّن سمو الأمير فهد نائباً لرئيس IFMA — أول سعودي يتولى قيادة الاتحاد الدولي. إجمالي الموسم: 9 ميداليات.',
    bodyEn: 'Hattan Alsaif became the first Saudi female senior world champion (Bangkok). World Combat Games, Riyadh: 3 gold medals (Hattan, Inad, Ali Alnasser). HRH Prince Fahad appointed IFMA Vice President — the first Saudi in IFMA leadership. Season total: 9 medals.',
  },
  {
    year: '2024',
    tagAr: 'ذهب للرجال وبارا',
    tagEn: 'Senior & Para Gold',
    titleAr: 'ذهب الكبار والبارا — أولمبياد باريس — 480 رياضياً وطنياً',
    titleEn: 'Senior & Para World Gold · Paris · 480 Athletes Nationally',
    bodyAr: 'البراء العمودي: أول ذهبية كبار ذكور سعودية (بطرا، اليونان). علي الناصر: ذهبية بارا البارالمبية. إجمالي دولي: 2 ذهبية، 1 فضية، 11 برونزية. تمثيل في القرية الأولمبية بباريس. بطولة المملكة الخامسة: 480+ رياضياً من جميع مناطق المملكة.',
    bodyEn: 'Albaraa Alamoudi claimed the first Saudi male senior world gold (Patras, Greece). Ali Alnasser won Para gold. International total: 2 gold, 1 silver, 11 bronze. Exhibition representation at the Paris Olympic Village. 5th Kingdom Championship: 480+ athletes from across the Kingdom.',
  },
  {
    year: '2025',
    tagAr: 'أقوى موسم',
    tagEn: 'Strongest Season',
    titleAr: 'أقوى موسم دولي — ذهبيات الشباب وبريق متعدد البطولات',
    titleEn: 'Strongest Season — Youth Golds & Multi-Event Podiums',
    bodyAr: 'فاطمة كشميري والجوهرة الهزاء: أول ذهبيتَين سعوديتَين في بطولة العالم للشباب (أبوظبي). أول مشاركة في ألعاب CISM العسكرية (بانكوك): 3 برونزيات. دورة الألعاب الآسيوية للشباب (البحرين): برونزية. دورة ألعاب التضامن الإسلامي (الرياض): 1 فضية، 1 برونزية. إجمالي الموسم: 2 ذهبية، 5 فضيات، 9 برونزيات.',
    bodyEn: 'Fatimah Kashmiri and Aljawharah Alhazzaa became the first Saudi youth world champions (Abu Dhabi). CISM Military World Games debut (Bangkok): 3 bronze. Asian Youth Games (Bahrain): 1 bronze. Islamic Solidarity Games (Riyadh): 1 silver, 1 bronze. Season total: 2 gold, 5 silver, 9 bronze.',
  },
  {
    year: '2026',
    tagAr: 'جامعي عالمي',
    tagEn: 'World Universities',
    titleAr: 'ألعاب الجامعات العالمية — استمرار التوسع',
    titleEn: 'FISU World University Games & Continued Expansion',
    bodyAr: 'مثّل ثلاثة رياضيين سعوديين المملكة في دورة ألعاب الجامعات العالمية (FISU) ببرازيليا، البرازيل، محققين 3 ميداليات برونزية — وهو أول تمثيل سعودي في هذه الدورة الرفيعة. يواصل الاتحاد توسيع حضوره في المحافل الرياضية الدولية متعددة الرياضات.',
    bodyEn: 'Three Saudi athletes represented the Kingdom at the FISU World University Games in Brasilia, Brazil, winning 3 bronze medals — the first-ever Saudi participation at this prestigious multi-sport event. SMF continues to expand its footprint across international multi-sport competitions.',
  },
];

export default function History() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/organization/overview">{ar ? 'الاتحاد' : 'The Organization'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'تاريخ الاتحاد' : 'SMF History'}</span>
          </nav>
          <h1>{ar ? 'تاريخ الاتحاد السعودي للملاكمة التايلندية' : 'History of the Saudi Muaythai Federation'}</h1>
          <p>
            {ar
              ? 'منذ تأسيسه، يقود الاتحاد مسيرة نمو المواي تاي في المملكة تحت قيادة سمو الأمير فهد بن منصور بن سعد بن سعود آل سعود.'
              : 'Since its establishment, SMF has been at the forefront of growing Muaythai in the Kingdom under the leadership of HRH Prince Fahad bin Mansour bin Saad Al Saud.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <blockquote className="history-quote">
            <span className="history-quote__mark" aria-hidden="true">&quot;</span>
            <p className="history-quote__text">
              {ar
                ? 'للمواي تاي مستقبل مشرق في المملكة العربية السعودية. أسهم الانتشار العالمي للفنون القتالية المختلطة في تسليط الضوء على المواي تاي بوصفها أحد أرقى أشكال رياضات القتال، وهي رياضة تقوم على الانضباط والتفاني واللياقة البدنية — سمات تنسجم تماماً مع رؤية 2030.'
                : 'Muaythai has a bright future in Saudi Arabia. The global rise of MMA has put Muaythai on the map as one of the highest form of combat sports which demands discipline, dedication and fitness – attributes that are in line with the vision 2030.'}
              <br />
              <br />
              {ar
                ? 'ستجد الأجيال القادمة من الشباب السعودي في المواي تاي تأهيلاً مثالياً لمواجهة تحديات عالم اليوم، وسنحرص على إتاحة الفرصة لأكبر عدد ممكن من الشباب والشابات لاكتشاف هذه الرياضة وما تقدمه لهم من بناء شخصي وعقلي وجسدي.'
                : "The upcoming generation of young Saudis will find a perfect preparation for the challenges of today's world through Muaythai and we will ensure that as many young male and female will be able to experience this sport for their personal, mental and physical development."}
            </p>
            <footer className="history-quote__footer">
              —{' '}
              <cite>
                {ar
                  ? 'الأمير فهد بن منصور بن سعد بن سعود آل سعود'
                  : 'Prince Fahad Al Saud, President of the Saudi Muaythai Federation'}
              </cite>
            </footer>
          </blockquote>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? '٢٠١٩ — ٢٠٢٦' : '2019 — 2026'}</span>
            <h2>{ar ? 'المحطات الرئيسية' : 'Timeline of Key Milestones'}</h2>
          </div>

          <ol className="timeline">
            {TIMELINE.map((item) => (
              <li className="timeline__item" key={item.year}>
                <div className="timeline__year">{item.year}</div>
                <div className="timeline__dot" aria-hidden="true" />
                <div className="timeline__content">
                  <span className="timeline__tag">{ar ? item.tagAr : item.tagEn}</span>
                  <h3>{ar ? item.titleAr : item.titleEn}</h3>
                  <p>{ar ? item.bodyAr : item.bodyEn}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <p className="values-cta__text">
            {ar
              ? 'تعرّف على التفاصيل الكاملة للميداليات والبطولات والمعالم المؤسسية للاتحاد.'
              : 'Discover the full details of every medal, championship, and institutional milestone.'}
          </p>
          <div className="values-cta__btns">
            <Link to="/organization/achievements" className="btn btn--gold">{ar ? 'الإنجازات' : 'Achievements'}</Link>
            <Link to="/organization/results-archive" className="btn btn--outline btn--outline-white">{ar ? 'سجل النتائج الدولية' : 'Results Archive'}</Link>
          </div>
        </div>
      </section>
    </>
  );
}
