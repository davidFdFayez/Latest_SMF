import { Link } from 'react-router-dom';
import { useLang } from '../../context/LanguageContext';

const LIMBS = [
  { img: '/assets/images/limb-fists.jpg', titleAr: 'القبضتان', titleEn: 'Fists', descAr: 'لكمة مباشرة، جانبية، صاعدة، دائرية', descEn: 'Jab, cross, hook, uppercut' },
  { img: '/assets/images/limb-shins.jpg', titleAr: 'الساقان', titleEn: 'Shins', descAr: 'ركلة أمامية، دائرية، جانبية، خلفية', descEn: 'Teep, round kick, side kick, back kick' },
  { img: '/assets/images/limb-elbows.jpg', titleAr: 'المرفقان', titleEn: 'Elbows', descAr: 'أفقي، قطري، صاعد، نازل', descEn: 'Horizontal, diagonal, uppercut, downward' },
  { img: '/assets/images/limb-knees.jpg', titleAr: 'الركبتان', titleEn: 'Knees', descAr: 'ركبة مستقيمة، جانبية، طائرة', descEn: 'Straight, side, flying knee' },
];

const TIMELINE = [
  {
    n: '01',
    tagAr: 'قرون من الموروث',
    tagEn: 'Centuries of Heritage',
    titleAr: 'الجذور التاريخية',
    titleEn: 'Ancient Origins',
    bodyAr: 'يرتبط تاريخ المواي تاي ارتباطًا وثيقًا بتاريخ مملكة تايلاند، حيث نشأت في الأصل كأسلوب للقتال اليدوي والدفاع عن النفس. وقد تدرب المحاربون على المواي تاي لحماية أرضهم وشعبهم، حتى أصبحت تُعرف باسم "فن الأطراف الثمانية" لاعتمادها على استخدام القبضتين والمرفقين والركبتين والساقين، مما يجعلها واحدة من أكثر الفنون القتالية تنوعًا وفعالية',
    bodyEn: "Muaythai's history is deeply intertwined with Thailand's past. Initially developed as a form of hand-to-hand combat, warriors trained in Muaythai to protect their land and people. Known as \"The Art of Eight Limbs,\" Muaythai utilizes punches, kicks, elbows, and knees, making it one of the most versatile martial arts.",
  },
  {
    n: '02',
    tagAr: 'القرن العشرون',
    tagEn: '20th Century',
    titleAr: 'العصر الحديث',
    titleEn: 'The Modern Era',
    bodyAr: 'مع دخول تايلاند القرن العشرين، انتقلت المواي تاي من ساحات القتال إلى المنافسات الرياضية المنظمة. وأُنشئت ملاعب عريقة مثل راجادامنيرن ولومبيني، مما أسهم في ترسيخ مكانة المواي تاي كرياضة احترافية. وفي أواخر القرن العشرين، حظيت اللعبة باعتراف دولي واسع، وانتشرت بين الرياضيين والجماهير حول العالم. كما ساهم تأسيس الاتحاد الدولي لجمعيات المواي تاي (IFMA) في توحيد القوانين، وتعزيز معايير السلامة، ودعم انتشار الرياضة عالميًا.',
    bodyEn: 'As Thailand moved into the 20th century, Muaythai transitioned from battlefield practice to organized sport. Stadiums like Rajadamnern and Lumpinee were established, solidifying Muaythai as a professional sport. In the late 20th century, Muaythai gained international recognition, with fighters and fans from around the world embracing its techniques. The formation of the International Federation of Muaythai Associations (IFMA) ensured standardized rules, safety, and global promotion.',
  },
  {
    n: '03',
    tagAr: 'الحاضر',
    tagEn: 'Present Day',
    titleAr: 'الوقت الحاضر',
    titleEn: 'Recognition & Globalization',
    bodyAr: 'أصبحت المواي تاي اليوم رياضةً تحظى بتقدير عالمي بفضل قيمتها الثقافية ومستواها الرياضي المتميز. وقد نالت اعترافًا من العديد من المنظمات الرياضية الدولية، وأصبحت حاضرة في بطولات عالمية مثل دورة الألعاب العالمية، كما أُدرجت في فعاليات استعراضية ضمن الألعاب الأولمبية، في خطوة تعكس تطورها المستمر وتمهد الطريق نحو حضور أولمبي كامل في المستقبل.',
    bodyEn: "Muaythai's cultural significance and athletic rigor have earned it recognition by major organizations. Endorsed as a respected martial art, Muaythai now features in global events like the World Games and exhibition events during the Olympics — paving the way for full Olympic representation.",
  },
  {
    n: '04',
    tagAr: '2019 — حتى اليوم',
    tagEn: '2019 — Present',
    titleAr: 'المواي تاي في المملكة العربية السعودية',
    titleEn: 'Muaythai in Saudi Arabia',
    bodyAr: 'شكّل تأسيس الاتحاد السعودي للمواي تاي عام 2019 نقطة تحول في مسيرة رياضة المواي تاي بالمملكة. وبدعم من رؤية القيادة الرشيدة، وحصول الاتحاد على عضوية الاتحاد الدولي للمواي تاي (IFMA)، شهدت الرياضة نموًا ملحوظًا وانتشارًا واسعًا بين الشباب والنساء في مختلف مناطق المملكة. وعمل الاتحاد السعودي للمواي تاي على تنفيذ العديد من البرامج الهادفة إلى اكتشاف وصقل المواهب الوطنية، إلى جانب نشر رياضة المواي تاي في المدارس والجامعات. كما يواصل لاعبو ولاعبات المملكة تحقيق الإنجازات بحصد الميداليات في بطولات العالم للمواي تاي التي ينظمها الاتحاد الدولي (IFMA)، بما يعكس التطور المستمر للرياضة ومكانتها المتنامية على الساحة الدولية.',
    bodyEn: "The establishment of the Saudi Muaythai Federation (SMF) in 2019 marked a new chapter in Muaythai's history in the Kingdom. Under the vision of Saudi leadership and with IFMA membership, the sport has flourished among youth and women across the Kingdom. SMF has implemented programs to nurture local talent and introduce Muaythai to schools and universities, while Saudi athletes continue to win medals at IFMA World Championships.",
  },
];

export default function AboutHistory() {
  const { lang } = useLang();
  const ar = lang === 'ar';

  return (
    <>
      <section className="page-header">
        <div className="container">
          <nav className="breadcrumb" aria-label={ar ? 'مسار التنقل' : 'Breadcrumb'}>
            <Link to="/">{ar ? 'الرئيسية' : 'Home'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <Link to="/about-muaythai/history">{ar ? 'عن المواي تاي' : 'About Muaythai'}</Link>
            <span className="breadcrumb__sep" aria-hidden="true">›</span>
            <span>{ar ? 'تاريخ المواي تاي' : 'History of Muaythai'}</span>
          </nav>
          <h1>{ar ? 'تاريخ المواي تاي' : 'History of Muaythai'}</h1>
          <p>
            {ar
              ? 'فن قتالي يمتد تاريخه عبر قرون، متجاوزًا حدود الزمان والمكان ليصبح رياضةً عالمية تحظى بالتقدير والانتشار.'
              : 'A martial art with a legacy spanning centuries, transcending time and borders to become a globally celebrated sport.'}
          </p>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <p className="page-intro">
            {ar
              ? 'المواي تاي، والمعروفة أيضًا باسم الملاكمة التايلاندية، هي فن قتالي ورياضة قتالية يعود تاريخها إلى مئات السنين. نشأت في مملكة تايلاند كأسلوب للدفاع عن النفس خلال فترات الحروب والنزاعات، ثم تطورت مع مرور الوقت لتصبح رياضةً تحظى باحترام وممارسة واسعة حول العالم. وتتميز المواي تاي بمزجها الفريد بين الإرث الثقافي والأداء الرياضي، مما جعلها رمزًا للانضباط والاحترام والتقاليد، إلى جانب كونها واحدة من أكثر الرياضات القتالية تطورًا وانتشارًا على المستوى الدولي.'
              : 'Muaythai, also known as Thai Boxing, is a martial art and combat sport with a legacy that spans centuries. It originated in Thailand as a method of self-defense during times of conflict and evolved into a highly respected sport celebrated worldwide. Recognized for its unique combination of cultural heritage and athleticism, Muaythai has become a symbol of discipline, respect, and tradition.'}
          </p>
        </div>
      </section>

      <section className="section--grey">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--amber">{ar ? 'فن الأطراف الثمانية' : 'Art of Eight Limbs'}</span>
            <h2>{ar ? 'الأسلحة الثمانية للمواي تاي' : 'The 8 Weapons of Muaythai'}</h2>
          </div>

          <div className="eight-limbs-grid">
            {LIMBS.map((l) => (
              <div className="limb-card" key={l.titleEn}>
                <div className="limb-card__img">
                  <img src={l.img} alt={ar ? l.titleAr : l.titleEn} loading="lazy" />
                </div>
                <h3>{ar ? l.titleAr : l.titleEn}</h3>
                <p>{ar ? l.descAr : l.descEn}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section--white">
        <div className="container">
          <div className="section-header section-header--center">
            <span className="section-label section-label--green">{ar ? 'الحضارة والرياضة' : 'Heritage & Sport'}</span>
            <h2>{ar ? 'مراحل تطور المواي تاي' : 'The Evolution of Muaythai'}</h2>
          </div>

          <ol className="timeline">
            {TIMELINE.map((t) => (
              <li className="timeline__item" key={t.n}>
                <div className="timeline__year">{t.n}</div>
                <div className="timeline__dot" aria-hidden="true" />
                <div className="timeline__content">
                  <span className="timeline__tag">{ar ? t.tagAr : t.tagEn}</span>
                  <h3>{ar ? t.titleAr : t.titleEn}</h3>
                  <p>{ar ? t.bodyAr : t.bodyEn}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section--green-gradient values-cta">
        <div className="container">
          <h2>{ar ? 'الإرث والمستقبل' : 'Legacy & Future'}</h2>
          <p className="values-cta__text">
            {ar
              ? 'تتواصل الموروثات الراسخة للمواي تاي عبر الطقوس الأصيلة، كرقصة "واي كرو" (Wai Kru) قبل المباريات، وارتداء "المونكون" (Mongkhon) الذي يُجسّد التبجيل والتقدير والانتماء. وبينما تواصل الرياضة مسيرتها في الانتشار والتطور، تبقى رسالتها الجوهرية حاضرة: تعزيز الانضباط والاحترام والصمود في نفوس الممارسين في كل أنحاء العالم.'
              : "Muaythai's rich traditions are preserved through rituals such as the Wai Kru (fighter's dance) and the wearing of the Mongkhon (sacred headpiece). As it continues to evolve, Muaythai inspires millions with its emphasis on discipline, respect, and resilience."}
          </p>
          <Link to="/about-muaythai/pillars" className="btn btn--gold">
            {ar ? 'اكتشف ركائز المواي تاي الخمس' : 'Discover the 5 Pillars of Muaythai'}
          </Link>
        </div>
      </section>
    </>
  );
}
