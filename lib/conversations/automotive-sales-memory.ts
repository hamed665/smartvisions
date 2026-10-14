import type { ConversationMemoryItem, SalesStateEvidence, SalesStateRevision } from '@/lib/agents/contracts';

export type AutomotiveService =
  | 'FLOOR_MATS' | 'SEAT_UPHOLSTERY' | 'THERMAL_TINT' | 'PPF'
  | 'CERAMIC_COATING' | 'CAR_SCREEN' | 'LED_LIGHTING' | 'CAR_AUDIO';

export type AutomotiveSalesMemory = {
  make?: string;
  model?: string;
  year?: number;
  seats?: number;
  service?: AutomotiveService;
  preferredColor?: string;
};

const makes: Array<[string, RegExp]> = [
  ['Toyota', /(?:تويوتا|تویوتا|toyota)/i],
  ['Nissan', /(?:نيسان|نیسان|nissan)/i],
  ['Lexus', /(?:لكزس|لکسوس|لکسز|lexus)/i],
  ['Ford', /(?:فورد|ford)/i],
  ['Chevrolet', /(?:شفروليه|شفرليه|شفروليت|chevrolet|chevy)/i],
  ['GMC', /(?:جي ام سي|جمس|\bgmc\b)/i],
  ['Jeep', /(?:جيب|جیپ|jeep)/i],
  ['Kia', /(?:كيا|کیا|\bkia\b)/i],
  ['Hyundai', /(?:هيونداي|هیوندای|hyundai)/i],
  ['Honda', /(?:هوندا|honda)/i],
  ['Volvo', /(?:فولفو|volvo)/i],
];
const models: Array<[string, string, RegExp]> = [
  ['Land Cruiser', 'Toyota', /(?:لاند\s*كروزر|لاند\s*کروزر|لند\s*كروزر|land[\s-]*cruiser)/i],
  ['Prado', 'Toyota', /(?:برادو|پرادو|prado)/i],
  ['Camry', 'Toyota', /(?:كامري|کمری|camry)/i],
  ['Corolla', 'Toyota', /(?:كورولا|کرولا|corolla)/i],
  ['Yaris', 'Toyota', /(?:يارس|یاریس|yaris)/i],
  ['Patrol', 'Nissan', /(?:باترول|پاترول|patrol)/i],
  ['Sunny', 'Nissan', /(?:صني|سني|sunny)/i],
  ['Altima', 'Nissan', /(?:التيما|آلتیما|altima)/i],
  ['RAV4', 'Toyota', /(?:راف\s*4|راف٤|\brav[\s-]?4\b)/i],
];
const services: Array<[AutomotiveService, RegExp]> = [
  ['THERMAL_TINT', /(?:عازل\s*حراري|عازل\s*حرارتی|عازل|تظليل|تضليل|تنت|window tint|window film|heat rejection)/i],
  ['FLOOR_MATS', /(?:فرش\s*(?:أرضيات|ارضيات|ارض)|دواسات|كفپوش|کفپوش|5d\s*(?:mat|فرش)|3d\s*(?:mat|فرش)|floor mats?)/i],
  ['SEAT_UPHOLSTERY', /(?:تلبيس|تلبيسات|تنجيد|تودوزی|روکش|كرسي\s*سيارة|seat covers?|upholster)/i],
  ['PPF', /(?:\bppf\b|paint protection film|حماية\s*(?:البوية|البودي|الطلاء)|افلام\s*حماية)/i],
  ['CERAMIC_COATING', /(?:سيراميك|سرامیک|ceramic\s*(?:coating|paint)|نانو\s*سيراميك)/i],
  ['CAR_SCREEN', /(?:شاشة|شاشه|شاشات|مانیتور|مانيتور|carplay|كار\s*بلاي|اندرويد\s*للسيارة|head\s*unit)/i],
  ['LED_LIGHTING', /(?:\bled\b|ليد|لمبات|إضاءة\s*السيارة|اضاءة\s*السيارة)/i],
  ['CAR_AUDIO', /(?:سماعات|مكبرات|مكبر\s*صوت|car audio|car speaker|ساب\s*ووفر)/i],
];
const colors: Array<[string, RegExp]> = [
  ['black', /(?:أسود|اسود|سودا|مشکی|مشكي|black)/i],
  ['red', /(?:أحمر|احمر|قرمز|red)/i],
  ['beige', /(?:بيج|بژ|beige)/i],
  ['brown', /(?:بني|بنی|قهوه‌ای|brown)/i],
  ['white', /(?:أبيض|ابيض|سفید|سفيد|white)/i],
];

const normalizedDigits = (value: string) => value.replace(/[۰-۹٠-٩]/g, (digit) => {
  const farsi = '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit);
  return String(farsi >= 0 ? farsi : '٠١٢٣٤٥٦٧٨٩'.indexOf(digit));
});
function snippet(value: string) { return value.trim().replace(/\s+/g, ' ').slice(0, 200); }

export function inferAutomotiveFacts(message: string, referenceDate = new Date()): AutomotiveSalesMemory {
  const normalized = normalizedDigits(message).normalize('NFKC');
  const explicitMakes = makes.filter(([, pattern]) => pattern.test(normalized)).map(([name]) => name);
  const matchedModels = models.filter(([, , pattern]) => pattern.test(normalized));
  const distinctMakeNames = [...new Set([...explicitMakes, ...matchedModels.map((model) => model[1])])];
  // If the customer is comparing two cars, don't remember one as their car.
  const make = distinctMakeNames.length === 1 ? distinctMakeNames[0] : undefined;
  const model = distinctMakeNames.length === 1 && matchedModels.length === 1
    ? matchedModels[0][0] : undefined;
  const years = [...normalized.matchAll(/(?:^|[^\d])((?:19\d{2}|20[0-3]\d))(?!\d)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 1990 && value <= referenceDate.getUTCFullYear() + 1);
  const year = years.length ? years[years.length - 1] : undefined;
  const seats = /(?:^|\D)5\s*(?:مقاعد|كراسي|كرسي|صندلی|صندلي|seats?)(?!\p{L})/iu.test(normalized)
    || /(?:خمسة|خمس|پنج)\s*(?:مقاعد|كراسي|صندلی|صندلي)/i.test(normalized) ? 5
    : /(?:^|\D)7\s*(?:مقاعد|كراسي|كرسي|صندلی|صندلي|seats?)(?!\p{L})/iu.test(normalized)
      || /(?:سبعة|سبع|هفت)\s*(?:مقاعد|كراسي|صندلی|صندلي)/i.test(normalized) ? 7 : undefined;
  const matchedServices = services.filter(([, pattern]) => pattern.test(normalized));
  const service = matchedServices.length === 1 ? matchedServices[0][0] : undefined;
  const preferredColor = /(?:أبغي|ابغي|أريد|اريد|ابي|بغيت|prefer|want|اختار|أختار|بـ|باللون|رنگ)/i.test(normalized)
    ? colors.find(([, pattern]) => pattern.test(normalized))?.[0] : undefined;
  return { make, model, year, seats, service, preferredColor };
}

export function updateAutomotiveSalesMemory(input: {
  previous?: AutomotiveSalesMemory;
  body: string;
  item: ConversationMemoryItem;
  evidence: Record<string, SalesStateEvidence>;
  revisions: SalesStateRevision[];
}): AutomotiveSalesMemory {
  const extracted = inferAutomotiveFacts(input.body);
  const next = { ...(input.previous ?? {}) };
  for (const key of ['make', 'model', 'year', 'seats', 'service', 'preferredColor'] as const) {
    const incoming = extracted[key];
    if (incoming == null) continue;
    const previousValue = next[key];
    if (previousValue !== incoming) {
      if (previousValue != null) input.revisions.push({
        field: 'automotive.' + key,
        from: previousValue,
        to: incoming,
        sourceId: input.item.sourceId,
        at: input.item.at,
      });
      if (key === 'make' && previousValue && previousValue !== incoming && !extracted.model) {
        next.model = undefined;
      }
      (next as Record<string, unknown>)[key] = incoming;
      input.evidence['automotive.' + key] = {
        sourceId: input.item.sourceId,
        at: input.item.at,
        excerpt: snippet(input.body),
      };
    }
  }
  return next;
}

export function automotiveSummary(state?: AutomotiveSalesMemory) {
  if (!state) return '';
  const car = [state.make, state.model, state.year].filter((value) => value != null).join(' ');
  const rest = [
    state.seats ? String(state.seats) + ' seats' : '',
    state.service ? 'service=' + state.service : '',
    state.preferredColor ? 'color=' + state.preferredColor : '',
  ].filter(Boolean).join(', ');
  return [car && 'Vehicle: ' + car, rest].filter(Boolean).join(' | ');
}
