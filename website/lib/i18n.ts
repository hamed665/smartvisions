export const locales = ['en', 'ar', 'fa', 'fr', 'es'] as const;
export type Locale = (typeof locales)[number];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
  fa: 'فارسی',
  fr: 'Français',
  es: 'Español',
};

export const localeDirection = (locale: Locale) => (locale === 'ar' || locale === 'fa' ? 'rtl' : 'ltr');
export const isLocale = (value: string): value is Locale => locales.includes(value as Locale);

type Copy = {
  eyebrow: string;
  headline: string;
  subhead: string;
  primaryCta: string;
  secondaryCta: string;
  capabilitiesTitle: string;
  capabilitiesIntro: string;
  insightTitle: string;
  marketTitle: string;
  contactTitle: string;
  contactText: string;
  nav: { work: string; services: string; industries: string; insights: string; company: string };
};

export const copy: Record<Locale, Copy> = {
  en: {
    eyebrow: 'AI · DIGITAL · GROWTH · TECHNOLOGY',
    headline: 'We build businesses for what’s next.',
    subhead: 'Strategy, technology and creative execution engineered as one system for companies that intend to lead, not merely keep up.',
    primaryCta: 'Explore our capabilities', secondaryCta: 'Start a conversation',
    capabilitiesTitle: 'One partner. Multiple growth engines.',
    capabilitiesIntro: 'From the first customer touchpoint to the systems operating behind it, we design the whole commercial experience.',
    insightTitle: 'Intelligence built for decision-makers', marketTitle: 'Built in Oman. Designed for global markets.',
    contactTitle: 'Your next growth chapter should not look like the last one.', contactText: 'Bring us the commercial problem. We will design the system around it.',
    nav: { work: 'Work', services: 'Capabilities', industries: 'Industries', insights: 'Insights', company: 'Company' },
  },
  ar: {
    eyebrow: 'ذكاء اصطناعي · نمو · تقنية · تجربة رقمية',
    headline: 'نبني أعمالاً جاهزة لما هو قادم.',
    subhead: 'من عُمان إلى الأسواق الإقليمية والعالمية، نصمم أنظمة رقمية تجمع الاستراتيجية والتقنية والنمو في تجربة واحدة متماسكة.',
    primaryCta: 'اكتشف قدراتنا', secondaryCta: 'تحدث مع فريقنا',
    capabilitiesTitle: 'منظومة نمو واحدة، بقدرات متعددة.', capabilitiesIntro: 'نبدأ من تحدّي العمل الحقيقي، ثم نبني التقنية والمحتوى والأتمتة وقنوات التحويل حوله.',
    insightTitle: 'رؤى عملية لصنّاع القرار', marketTitle: 'خبرة محلية. طموح عالمي.', contactTitle: 'المشروع القادم يستحق أكثر من حل تقليدي.', contactText: 'شاركنا الهدف التجاري، وسنبني المسار الرقمي المناسب للوصول إليه.',
    nav: { work: 'أعمالنا', services: 'قدراتنا', industries: 'القطاعات', insights: 'الرؤى', company: 'الشركة' },
  },
  fa: {
    eyebrow: 'هوش مصنوعی · رشد · تکنولوژی · تجربه دیجیتال',
    headline: 'کسب‌وکار را برای مرحله بعد می‌سازیم.',
    subhead: 'استراتژی، تکنولوژی، محتوا و اتوماسیون را در یک سیستم منسجم کنار هم می‌گذاریم تا رشد فقط یک شعار بازاریابی نباشد.',
    primaryCta: 'توانمندی‌ها را ببینید', secondaryCta: 'شروع گفتگو', capabilitiesTitle: 'یک شریک، چند موتور رشد.',
    capabilitiesIntro: 'از اولین برخورد مشتری با برند تا سیستم‌هایی که پشت صحنه فروش را جلو می‌برند، کل تجربه را طراحی می‌کنیم.',
    insightTitle: 'محتوای تصمیم‌ساز، نه محتوای پرکننده', marketTitle: 'از عمان، برای بازارهای جهانی.', contactTitle: 'مرحله بعدی رشد نباید شبیه مرحله قبلی باشد.', contactText: 'مسئله تجاری را به ما بدهید؛ سیستم مناسبش را طراحی می‌کنیم.',
    nav: { work: 'پروژه‌ها', services: 'توانمندی‌ها', industries: 'صنایع', insights: 'بینش‌ها', company: 'شرکت' },
  },
  fr: {
    eyebrow: 'IA · DIGITAL · CROISSANCE · TECHNOLOGIE', headline: 'Nous construisons les entreprises de demain.',
    subhead: 'Une approche intégrée où stratégie, technologie et croissance travaillent ensemble pour transformer une ambition commerciale en système performant.',
    primaryCta: 'Découvrir nos expertises', secondaryCta: 'Parler à notre équipe', capabilitiesTitle: 'Un partenaire. Plusieurs moteurs de croissance.', capabilitiesIntro: 'Nous concevons l’expérience commerciale dans son ensemble, du premier contact client aux systèmes qui l’alimentent.',
    insightTitle: 'Des analyses conçues pour décider', marketTitle: 'Ancrés à Oman. Pensés pour le monde.', contactTitle: 'Votre prochaine phase de croissance mérite une nouvelle architecture.', contactText: 'Présentez-nous l’enjeu commercial. Nous construirons le système pour y répondre.',
    nav: { work: 'Réalisations', services: 'Expertises', industries: 'Secteurs', insights: 'Analyses', company: 'Groupe' },
  },
  es: {
    eyebrow: 'IA · DIGITAL · CRECIMIENTO · TECNOLOGÍA', headline: 'Construimos negocios preparados para lo que viene.',
    subhead: 'Unimos estrategia, tecnología y crecimiento en sistemas digitales capaces de convertir ambición empresarial en resultados medibles.',
    primaryCta: 'Explorar capacidades', secondaryCta: 'Hablar con el equipo', capabilitiesTitle: 'Un socio. Múltiples motores de crecimiento.', capabilitiesIntro: 'Diseñamos la experiencia comercial completa, desde el primer contacto hasta la infraestructura que impulsa ventas y servicio.',
    insightTitle: 'Inteligencia para tomar mejores decisiones', marketTitle: 'Nacidos en Omán. Diseñados para mercados globales.', contactTitle: 'La próxima etapa de crecimiento necesita una arquitectura distinta.', contactText: 'Cuéntanos el reto comercial. Diseñaremos el sistema adecuado para resolverlo.',
    nav: { work: 'Proyectos', services: 'Capacidades', industries: 'Industrias', insights: 'Ideas', company: 'Compañía' },
  },
};
