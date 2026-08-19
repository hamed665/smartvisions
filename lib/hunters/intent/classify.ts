const servicePatterns: Array<{ service: string; patterns: RegExp[] }> = [
  {
    service: 'website',
    patterns: [
      /\b(web ?site|web designer|web developer|wordpress|next\.?js|landing page|redesign)\b/i,
      /(موقع|مصمم مواقع|مطور مواقع|ووردبريس|تصميم موقع|تطوير موقع)/i,
    ],
  },
  {
    service: 'app_development',
    patterns: [/\b(mobile app|ios app|android app|app developer)\b/i, /(تطبيق|مطور تطبيقات|برمجة تطبيق)/i],
  },
  {
    service: 'ai_automation',
    patterns: [/\b(ai automation|automation|ai agent|chatbot|workflow automation)\b/i, /(أتمتة|اوتوميشن|ذكاء اصطناعي|شات بوت|وكيل ذكي)/i],
  },
  {
    service: 'whatsapp_ai',
    patterns: [/\b(whatsapp automation|whatsapp bot|whatsapp ai)\b/i, /(أتمتة واتساب|بوت واتساب|واتساب.*ذكاء)/i],
  },
  {
    service: 'content',
    patterns: [/\b(video editor|social media manager|content creator|reels|short form)\b/i, /(مونتير|ادارة سوشيال|إدارة سوشيال|صانع محتوى|ريلز|محتوى)/i],
  },
  {
    service: 'marketing',
    patterns: [/\b(marketing agency|digital marketing|seo|ads manager|performance marketing)\b/i, /(تسويق|سيو|إعلانات|ادارة اعلانات|إدارة إعلانات)/i],
  },
];

const explicitNeedPatterns = [
  /\b(looking for|need|seeking|hiring|wanted|anyone recommend|freelancer needed)\b/i,
  /(أبحث عن|ابحث عن|محتاج|نحتاج|مطلوب|أحتاج|احتاج|فريلانسر)/i,
];

export function classifyIntentText(text: string) {
  const explicitNeed = explicitNeedPatterns.some((pattern) => pattern.test(text));
  const matchedServices = servicePatterns
    .filter(({ patterns }) => patterns.some((pattern) => pattern.test(text)))
    .map(({ service }) => service);

  return {
    explicitNeed,
    matchedServices,
    isRelevant: explicitNeed && matchedServices.length > 0,
    primaryService: matchedServices[0],
  };
}
