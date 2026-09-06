import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommandExecutionResult } from './contracts';

export type CatalogComposeCommand = { type: 'CATALOG_COMPOSE'; rawText: string };

type CapabilityKey = 'videographer' | 'photographer' | 'model' | 'actor' | 'voiceTalent';

type PackageIntent = {
  reels?: number;
  stories?: number;
  price?: number;
  customQuote: boolean;
  filmed: boolean;
  sourceLine: string;
};

type CapabilityIntent = {
  key: CapabilityKey;
  enabled?: boolean;
  requiresAvailabilityConfirmation: boolean;
  pricingMode?: 'CUSTOM_QUOTE';
};

type CatalogDraft = {
  countryCode: string | null;
  currency: string | null;
  packages: PackageIntent[];
  flexibleReels: boolean;
  flexibleStories: boolean;
  capabilities: Partial<Record<CapabilityKey, CapabilityIntent>>;
  intakeRequiredFields: string[];
  unresolved: string[];
};

type ServiceSnapshot = { name: string; enabled: boolean; config: Record<string, unknown> };
type PriceSnapshot = {
  currency: string;
  price: number;
  minimumPrice: number | null;
  maxAutoDiscountPct: number;
  maxDiscountWithApprovalPct: number;
};

type ServiceOperation = {
  id: string;
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  expectedBefore: ServiceSnapshot | null;
};

type PriceOperation = {
  serviceId: string;
  countryCode: string;
  currency: string;
  price: number;
  minimumPrice: number | null;
  maxAutoDiscountPct: number;
  maxDiscountWithApprovalPct: number;
  expectedBefore: PriceSnapshot | null;
};

export type CatalogBatchPlan = {
  version: 1;
  source: 'TELEGRAM_OWNER_CATALOG_COMPOSER';
  countryCode: string;
  currency: string;
  services: ServiceOperation[];
  prices: PriceOperation[];
};

const COUNTRY_ALIASES: Array<{ code: string; currency: string; pattern: RegExp }> = [
  { code: 'OM', currency: 'OMR', pattern: /\b(?:oman|om)\b|عمان/i },
  { code: 'AE', currency: 'AED', pattern: /\b(?:uae|emirates|ae)\b|امارات/i },
  { code: 'SA', currency: 'SAR', pattern: /\b(?:saudi|ksa|sa)\b|عربستان|سعودی/i },
  { code: 'QA', currency: 'QAR', pattern: /\b(?:qatar|qa)\b|قطر/i },
  { code: 'GB', currency: 'GBP', pattern: /\b(?:uk|britain|england|gb)\b|انگلیس|بریتانیا/i },
  { code: 'US', currency: 'USD', pattern: /\b(?:usa|united states|us)\b|آمریکا/i },
];

const CAPABILITY_PATTERNS: Array<{ key: CapabilityKey; pattern: RegExp }> = [
  { key: 'videographer', pattern: /videograph(?:er|y)|film\s*crew|فیلم\s*بردار|فیلمبردار/i },
  { key: 'photographer', pattern: /photograph(?:er|y)|عکاس/i },
  { key: 'model', pattern: /\bmodels?\b|مدل/i },
  { key: 'actor', pattern: /\bactor\b|\bactress\b|بازیگر/i },
  { key: 'voiceTalent', pattern: /voice\s*talent|voice\s*over|گوینده|نریشن/i },
];

const toLatinDigits = (value: string) => value
  .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

const cleanLine = (value: string) => toLatinDigits(value)
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const safeRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asNumber = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

function mergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      output[key] = mergeRecord(safeRecord(output[key]), value as Record<string, unknown>);
    } else {
      output[key] = value;
    }
  }
  return output;
}

function quantity(line: string, kind: 'reels' | 'stories') {
  const pattern = kind === 'reels'
    ? /(\d{1,4})\s*(?:ai\s*)?(?:reels?|ریل(?:ز)?)/i
    : /(\d{1,4})\s*(?:stories?|story|استوری)/i;
  const match = line.match(pattern);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 && value <= 1000 ? value : undefined;
}

function explicitPrice(line: string) {
  const suffix = line.match(/(\d+(?:\.\d{1,3})?)\s*(?:OMR|AED|SAR|QAR|GBP|USD|ریال(?:\s*عمان)?|rial(?:s)?|درهم|dirham(?:s)?|pounds?|dollars?)\b/i);
  if (suffix) return Number(suffix[1]);
  const prefix = line.match(/(?:OMR|AED|SAR|QAR|GBP|USD)\s*(\d+(?:\.\d{1,3})?)/i);
  return prefix ? Number(prefix[1]) : undefined;
}

function hasCustomQuote(line: string) {
  return /custom\s*quote|quote\s*required|توافقی|قیمت.*(?:هماهنگ|تایید|تأیید)|(?:هماهنگ|تایید|تأیید).*قیمت/i.test(line);
}

function isDisabled(line: string) {
  return /\b(?:off|disabled|unavailable|do\s*not\s*offer|not\s*available)\b|غیرفعال|نداریم|ارائه\s*نمی/i.test(line);
}

function isEnabled(line: string) {
  return /\b(?:on|enabled|available|offer|arrange|coordination|coordinate)\b|داریم|فعال|قابل\s*هماهنگی|هماهنگ\s*می|ارائه\s*می/i.test(line);
}

function isHarmlessHeading(line: string) {
  return /^(?:پکیج|پکیج\s*محتوا|catalog|content\s*(?:packages?|catalog)|services?)(?:\s+.*)?$/i.test(line)
    && COUNTRY_ALIASES.some((item) => item.pattern.test(line));
}

export function parseCatalogComposerText(rawText: string): CatalogDraft {
  const normalized = toLatinDigits(rawText).replace(/\r/g, '');
  const lines = normalized
    .split(/\n|؛|;/)
    .map(cleanLine)
    .filter(Boolean)
    .slice(0, 60);

  const countryMatches = COUNTRY_ALIASES.filter((item) => item.pattern.test(normalized));
  const uniqueCountries = [...new Set(countryMatches.map((item) => item.code))];
  const selected = uniqueCountries.length === 1 ? COUNTRY_ALIASES.find((item) => item.code === uniqueCountries[0])! : null;
  const draft: CatalogDraft = {
    countryCode: selected?.code ?? null,
    currency: selected?.currency ?? null,
    packages: [],
    flexibleReels: false,
    flexibleStories: false,
    capabilities: {},
    intakeRequiredFields: [],
    unresolved: uniqueCountries.length > 1 ? ['چند بازار مختلف در یک دستور تشخیص داده شد؛ هر Batch باید فقط یک بازار داشته باشد.'] : [],
  };

  for (const line of lines) {
    if (isHarmlessHeading(line)) continue;

    const reels = quantity(line, 'reels');
    const stories = quantity(line, 'stories');
    const price = explicitPrice(line);
    const customQuote = hasCustomQuote(line);
    const anyQuantity = /هر\s*تعداد|هرچند|any\s*(?:number|quantity|amount)|flexible\s*quantity|custom\s*quantity/i.test(line);
    const mentionsReel = /reels?|ریل(?:ز)?/i.test(line);
    const mentionsStory = /stories?|story|استوری/i.test(line);

    if ((reels || stories) && (price != null || customQuote)) {
      if (price != null && (!Number.isFinite(price) || price < 0 || price > 1_000_000)) {
        draft.unresolved.push(line);
        continue;
      }
      draft.packages.push({
        ...(reels ? { reels } : {}),
        ...(stories ? { stories } : {}),
        ...(price != null ? { price } : {}),
        customQuote,
        filmed: /filmed|shoot|videograph|فیلم\s*بردار|فیلمبردار|تصویربرداری/i.test(line),
        sourceLine: line,
      });
      continue;
    }

    if (anyQuantity && (mentionsReel || mentionsStory)) {
      if (mentionsReel) draft.flexibleReels = true;
      if (mentionsStory) draft.flexibleStories = true;
      continue;
    }

    const matchedCapabilities = CAPABILITY_PATTERNS.filter((item) => item.pattern.test(line));
    if (matchedCapabilities.length) {
      const disabled = isDisabled(line);
      const enabled = isEnabled(line);
      const pricing = hasCustomQuote(line) || /قیمت.*توافقی|pricing.*custom/i.test(line);
      if (!disabled && !enabled && !pricing) {
        draft.unresolved.push(line);
        continue;
      }
      for (const capability of matchedCapabilities) {
        const previous = draft.capabilities[capability.key];
        draft.capabilities[capability.key] = {
          key: capability.key,
          enabled: disabled ? false : enabled ? true : previous?.enabled,
          requiresAvailabilityConfirmation: disabled ? false : true,
          pricingMode: pricing ? 'CUSTOM_QUOTE' : previous?.pricingMode,
        };
      }
      continue;
    }

    const fields: string[] = [];
    if (/location|city|لوکیشن|شهر|محل/i.test(line)) fields.push('location');
    if (/shoot\s*date|date|تاریخ|روز\s*فیلم/i.test(line)) fields.push('shootDate');
    if (/talent\s*count|model\s*count|تعداد\s*(?:مدل|بازیگر)/i.test(line)) fields.push('talentCount');
    if (/gender|جنسیت|زن|مرد|خانم|آقا/i.test(line)) fields.push('talentGender');
    if (fields.length && /قبل|before|required|بگیر|گرفته|ask|collect/i.test(line)) {
      draft.intakeRequiredFields.push(...fields);
      continue;
    }

    draft.unresolved.push(line);
  }

  draft.intakeRequiredFields = [...new Set(draft.intakeRequiredFields)];
  if (!draft.countryCode) draft.unresolved.unshift('بازار مشخص نیست؛ مثلاً «عمان» یا OMR را در دستور بنویس.');
  if (!draft.packages.length && !draft.flexibleReels && !draft.flexibleStories && !Object.keys(draft.capabilities).length && !draft.intakeRequiredFields.length) {
    draft.unresolved.push('هیچ تغییر قابل اعمالی از متن استخراج نشد.');
  }
  return draft;
}

function packageServiceId(intent: PackageIntent) {
  if (!intent.filmed && !intent.stories && intent.reels === 4) return 'ai_reels_4';
  if (!intent.filmed && !intent.stories && intent.reels === 8) return 'ai_reels_8';
  const parts = ['content'];
  if (intent.reels) parts.push(String(intent.reels), 'reels');
  if (intent.stories) parts.push(String(intent.stories), 'stories');
  return parts.join('_');
}

function packageName(intent: PackageIntent) {
  const pieces: string[] = [];
  if (intent.reels) pieces.push(`${intent.reels} Reels`);
  if (intent.stories) pieces.push(`${intent.stories} Stories`);
  return `${pieces.join(' + ')} Content Package`;
}

function serviceSnapshot(row: Record<string, unknown> | undefined): ServiceSnapshot | null {
  if (!row) return null;
  return { name: String(row.name), enabled: Boolean(row.enabled), config: safeRecord(row.config) };
}

function priceSnapshot(row: Record<string, unknown> | undefined): PriceSnapshot | null {
  if (!row) return null;
  return {
    currency: String(row.currency),
    price: asNumber(row.price),
    minimumPrice: row.minimum_price == null ? null : asNumber(row.minimum_price),
    maxAutoDiscountPct: asNumber(row.max_auto_discount_pct),
    maxDiscountWithApprovalPct: asNumber(row.max_discount_with_approval_pct),
  };
}

function stableJson(value: unknown) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stableJson(item)]));
  }
  return value;
}

export function isCatalogBatchPlan(value: unknown): value is CatalogBatchPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return plan.version === 1
    && plan.source === 'TELEGRAM_OWNER_CATALOG_COMPOSER'
    && typeof plan.countryCode === 'string'
    && typeof plan.currency === 'string'
    && Array.isArray(plan.services)
    && Array.isArray(plan.prices);
}

export async function prepareCatalogComposeMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  command: CatalogComposeCommand;
}): Promise<{ command: CatalogComposeCommand; preview: CommandExecutionResult }> {
  const draft = parseCatalogComposerText(input.command.rawText);
  if (draft.unresolved.length) {
    throw new Error(`کاتالوگ اعمال نشد. این بخش‌ها مبهم یا ناقص‌اند:\n${draft.unresolved.slice(0, 10).map((line) => `⚠️ ${line}`).join('\n')}`);
  }
  const countryCode = draft.countryCode!;
  const currency = draft.currency!;

  const [{ data: serviceRows, error: serviceError }, { data: priceRows, error: priceError }] = await Promise.all([
    input.supabase.from('services').select('id,name,enabled,config').eq('organization_id', input.organizationId),
    input.supabase.from('service_prices')
      .select('service_id,country_code,currency,price,minimum_price,max_auto_discount_pct,max_discount_with_approval_pct')
      .eq('organization_id', input.organizationId)
      .eq('country_code', countryCode),
  ]);
  if (serviceError) throw new Error(`Catalog service lookup failed: ${serviceError.message}`);
  if (priceError) throw new Error(`Catalog price lookup failed: ${priceError.message}`);

  const servicesById = new Map((serviceRows ?? []).map((row) => [String(row.id), row as Record<string, unknown>]));
  const pricesById = new Map((priceRows ?? []).map((row) => [String(row.service_id), row as Record<string, unknown>]));
  const serviceOps = new Map<string, ServiceOperation>();
  const priceOps = new Map<string, PriceOperation>();

  for (const intent of draft.packages) {
    const serviceId = packageServiceId(intent);
    const existingService = servicesById.get(serviceId);
    const existingPrice = pricesById.get(serviceId);
    if (!existingService) {
      serviceOps.set(serviceId, {
        id: serviceId,
        name: packageName(intent),
        enabled: true,
        config: {
          serviceFamily: 'CONTENT_PRODUCTION',
          productionMode: intent.filmed ? 'coordinated_filming' : 'human_assisted',
          requiresCustomQuote: intent.customQuote,
          contentQuantities: { reels: intent.reels ?? 0, stories: intent.stories ?? 0 },
        },
        expectedBefore: null,
      });
    }
    if (intent.price != null) {
      const before = priceSnapshot(existingPrice);
      priceOps.set(serviceId, {
        serviceId,
        countryCode,
        currency,
        price: intent.price,
        minimumPrice: before?.minimumPrice ?? null,
        maxAutoDiscountPct: before?.maxAutoDiscountPct ?? 0,
        maxDiscountWithApprovalPct: before?.maxDiscountWithApprovalPct ?? 0,
        expectedBefore: before,
      });
    }
  }

  const capabilityKeys = Object.keys(draft.capabilities) as CapabilityKey[];
  if (draft.flexibleReels || draft.flexibleStories || capabilityKeys.length || draft.intakeRequiredFields.length) {
    const serviceId = 'custom_content_production';
    const existing = servicesById.get(serviceId);
    const before = serviceSnapshot(existing);
    const capabilityPatch: Record<string, unknown> = {};
    for (const key of capabilityKeys) {
      const item = draft.capabilities[key]!;
      capabilityPatch[key] = {
        ...(item.enabled != null ? { enabled: item.enabled } : {}),
        requiresAvailabilityConfirmation: item.requiresAvailabilityConfirmation,
        ...(item.pricingMode ? { pricingMode: item.pricingMode } : {}),
      };
    }
    const patch: Record<string, unknown> = {
      serviceFamily: 'CONTENT_PRODUCTION',
      productionMode: 'coordinated',
      requiresCustomQuote: true,
      flexibleQuantities: {
        ...(draft.flexibleReels ? { reels: true } : {}),
        ...(draft.flexibleStories ? { stories: true } : {}),
      },
      ...(capabilityKeys.length ? { capabilities: capabilityPatch } : {}),
      ...(draft.intakeRequiredFields.length ? { intakeRequiredFields: draft.intakeRequiredFields } : {}),
      salesPolicy: {
        doNotClaimUnavailableWhenEnabled: true,
        availabilityRequiresHumanConfirmation: true,
        customPricingRequiresHumanConfirmation: true,
      },
      availableCountries: [countryCode],
    };
    serviceOps.set(serviceId, {
      id: serviceId,
      name: before?.name ?? 'Custom Content Production',
      enabled: before?.enabled ?? true,
      config: mergeRecord(before?.config ?? {}, patch),
      expectedBefore: before,
    });
  }

  const services = [...serviceOps.values()].sort((a, b) => a.id.localeCompare(b.id));
  const prices = [...priceOps.values()].sort((a, b) => a.serviceId.localeCompare(b.serviceId));
  if (!services.length && !prices.length) throw new Error('متن قابل فهم بود، اما هیچ تغییری نسبت به Catalog موجود لازم نیست.');

  const plan: CatalogBatchPlan = {
    version: 1,
    source: 'TELEGRAM_OWNER_CATALOG_COMPOSER',
    countryCode,
    currency,
    services: stableJson(services) as ServiceOperation[],
    prices: stableJson(prices) as PriceOperation[],
  };

  const lines = [
    `بازار: ${countryCode} / ${currency}`,
    ...services.map((op) => `${op.expectedBefore ? '✏️' : '➕'} Service: ${op.name} (${op.id})`),
    ...prices.map((op) => `${op.expectedBefore ? '💰' : '➕💰'} Price: ${op.serviceId} → ${op.price} ${op.currency}`),
    '',
    'هیچ تغییری هنوز اعمال نشده است.',
    'تأیید = اجرای اتمیک همه تغییرات؛ لغو = هیچ تغییر.',
  ];

  return {
    command: input.command,
    preview: {
      title: 'پیش‌نمایش Owner Catalog Composer',
      text: lines.join('\n'),
      before: {
        services: services.map((op) => ({ id: op.id, value: op.expectedBefore })),
        prices: prices.map((op) => ({ serviceId: op.serviceId, value: op.expectedBefore })),
      },
      after: plan,
      entityType: 'catalog_batch',
      entityId: countryCode,
      requiresConfirmation: true,
    },
  };
}

export async function executeCatalogComposeMutation(input: {
  supabase: SupabaseClient;
  organizationId: string;
  ownerUserId: string;
  command: CatalogComposeCommand;
  preview: CommandExecutionResult;
}) {
  if (!isCatalogBatchPlan(input.preview.after)) throw new Error('Stored catalog batch preview is invalid');
  const plan = input.preview.after;
  if (plan.countryCode.length !== 2 || plan.currency.length !== 3) throw new Error('Stored catalog batch market metadata is invalid');
  if (plan.services.length + plan.prices.length > 50) throw new Error('Catalog batch exceeds the 50-operation safety limit');

  const { data, error } = await input.supabase.rpc('apply_owner_catalog_batch', {
    p_organization_id: input.organizationId,
    p_plan: plan,
    p_owner_user_id: input.ownerUserId,
  });
  if (error) throw new Error(`Atomic catalog apply failed: ${error.message}`);
  const result = safeRecord(data);
  return {
    title: 'Catalog با تأیید مالک اعمال شد',
    text: `Batch اتمیک انجام شد: ${Number(result.services_changed ?? 0)} سرویس و ${Number(result.prices_changed ?? 0)} قیمت.`,
    before: input.preview.before,
    after: plan,
    entityType: 'catalog_batch',
    entityId: plan.countryCode,
    command: input.command,
    reversible: false,
  };
}
