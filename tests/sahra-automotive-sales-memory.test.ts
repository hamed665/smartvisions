import { describe, expect, it } from 'vitest';
import { deriveSalesState } from '@/lib/conversations/sales-state';
import { inferAutomotiveFacts } from '@/lib/conversations/automotive-sales-memory';
import { buildAgentInputForRuntime } from '@/lib/agents/openai-runtime-core';
import type { ConversationMemoryItem } from '@/lib/agents/contracts';

const at = new Date('2026-10-14T00:00:00Z');
const cases: Array<[string, string, string | number]> = [
  ['تويوتا', 'make', 'Toyota'],
  ['تویوتا', 'make', 'Toyota'],
  ['Toyota', 'make', 'Toyota'],
  ['نيسان', 'make', 'Nissan'],
  ['نیسان', 'make', 'Nissan'],
  ['لكزس', 'make', 'Lexus'],
  ['Lexus', 'make', 'Lexus'],
  ['فورد', 'make', 'Ford'],
  ['جمس', 'make', 'GMC'],
  ['جيب', 'make', 'Jeep'],
  ['كيا', 'make', 'Kia'],
  ['هيونداي', 'make', 'Hyundai'],
  ['هوندا', 'make', 'Honda'],
  ['فولفو', 'make', 'Volvo'],
  ['لاندكروزر', 'model', 'Land Cruiser'],
  ['لاند کروزر', 'model', 'Land Cruiser'],
  ['Land Cruiser', 'model', 'Land Cruiser'],
  ['برادو', 'model', 'Prado'],
  ['كامري', 'model', 'Camry'],
  ['كورولا', 'model', 'Corolla'],
  ['يارس', 'model', 'Yaris'],
  ['باترول', 'model', 'Patrol'],
  ['پاترول', 'model', 'Patrol'],
  ['صني', 'model', 'Sunny'],
  ['التيما', 'model', 'Altima'],
  ['RAV4', 'model', 'RAV4'],
  ['دودي للجامات', 'service', 'THERMAL_TINT'],
  ['privacy tint', 'service', 'THERMAL_TINT'],
  ['تغميق القزاز', 'service', 'THERMAL_TINT'],
  ['فرشات الأرض', 'service', 'FLOOR_MATS'],
  ['ماتات السيارة', 'service', 'FLOOR_MATS'],
  ['كفرات الكراسي', 'service', 'SEAT_UPHOLSTERY'],
  ['عازل حراري', 'service', 'THERMAL_TINT'],
  ['تظليل', 'service', 'THERMAL_TINT'],
  ['فرش أرضيات 5D', 'service', 'FLOOR_MATS'],
  ['دواسات', 'service', 'FLOOR_MATS'],
  ['کفپوش', 'service', 'FLOOR_MATS'],
  ['تلبيسات', 'service', 'SEAT_UPHOLSTERY'],
  ['تنجيد', 'service', 'SEAT_UPHOLSTERY'],
  ['روکش صندلی', 'service', 'SEAT_UPHOLSTERY'],
  ['PPF', 'service', 'PPF'],
  ['سيراميك', 'service', 'CERAMIC_COATING'],
  ['شاشة', 'service', 'CAR_SCREEN'],
  ['carplay', 'service', 'CAR_SCREEN'],
  ['LED', 'service', 'LED_LIGHTING'],
  ['سماعات', 'service', 'CAR_AUDIO'],
  ['موديل ٢٠٢٢', 'year', 2022],
  ['سنة ۲۰۲۱', 'year', 2021],
  ['Land Cruiser 2018', 'year', 2018],
  ['Toyota 2026', 'year', 2026],
  ['٥ مقاعد', 'seats', 5],
  ['7 seats', 'seats', 7],
  ['سبعة مقاعد', 'seats', 7],
  ['خمسة كراسي', 'seats', 5],
  ['أبغي أسود', 'preferredColor', 'black'],
  ['أريد أحمر', 'preferredColor', 'red'],
  ['أبغي بيج', 'preferredColor', 'beige'],
  ['بغيت بني', 'preferredColor', 'brown'],
  ['I want white', 'preferredColor', 'white'],
];

function turn(body: string, index = 0, direction: 'INBOUND'|'OUTBOUND'='INBOUND'): ConversationMemoryItem {
  return {
    sourceId: 'canonical-' + index,
    direction,
    senderType: direction === 'INBOUND' ? 'CUSTOMER' : 'HUMAN',
    body,
    at: new Date(at.getTime()+index*60_000).toISOString(),
  };
}

describe('Sahra automotive verified customer memory scenarios', () => {
  it.each(cases)('extracts entity/intent from %s', (phrase, field, expected) => {
    expect(inferAutomotiveFacts(phrase, at)[field as keyof ReturnType<typeof inferAutomotiveFacts>]).toBe(expected);
  });

  it('remembers car and service across brief turns and switches to the most recent service', () => {
    const history = [
      turn('عندكم فرش أرضيات للاندكروزر؟', 1),
      turn('موديل ٢٠٢٢', 2),
      turn('جم يطلع؟', 3),
      turn('وبعد أبغي عازل حراري', 4),
      turn('أبغي أسود', 5),
    ];
    const state = deriveSalesState({ history, automotiveBusiness: true, language: 'ar-OM' });
    expect(state.automotive).toEqual({
      make: 'Toyota', model: 'Land Cruiser', year: 2022,
      service: 'THERMAL_TINT', preferredColor: 'black',
    });
    expect(state.rollingSummary).toContain('Toyota Land Cruiser 2022');
    expect(state.rollingSummary).toContain('THERMAL_TINT');
    expect(state.deliverables).toEqual([]);
    expect(state.productionNeeds).toEqual([]);
    expect(state.evidence['automotive.service'].sourceId).toBe('canonical-4');
  });

  it('never interprets 2022 car model as 2022 marketing models or a booking date', () => {
    const state = deriveSalesState({ history: [turn('موديل ٢٠٢٢')], automotiveBusiness: true });
    expect(state.automotive?.year).toBe(2022);
    expect(state.deliverables).toEqual([]);
    expect(state.date).toBeUndefined();
    expect(state.productionNeeds).toEqual([]);
  });

  it('retains correct versioned memory without duplicating facts on retries', () => {
    const history = [turn('تويوتا كامري ٢٠٢١', 1), turn('٥ مقاعد', 2), turn('شو تنصح؟', 3)];
    const one = deriveSalesState({ history, automotiveBusiness: true });
    const two = deriveSalesState({ history, previous: one, automotiveBusiness: true });
    expect(two.automotive).toEqual(one.automotive);
    expect(two.revisions).toEqual(one.revisions);
    expect(two.processedEvidenceIds.length).toBe(3);
  });

  it('records explicit corrections and clears model when vehicle make changes', () => {
    const previous = deriveSalesState({ history: [turn('نيسان باترول ٢٠٢٠', 1)], automotiveBusiness: true });
    const next = deriveSalesState({
      previous,
      history: [turn('نيسان باترول ٢٠٢٠', 1),turn('لا قصدي تويوتا ٢٠٢٢', 2)],
      automotiveBusiness: true,
    });
    expect(next.automotive).toMatchObject({ make: 'Toyota', year: 2022 });
    expect(next.automotive?.model).toBeUndefined();
    expect(next.revisions.map((entry) => entry.field)).toContain('automotive.make');
    expect(next.revisions.map((entry) => entry.field)).toContain('automotive.year');
  });

  it('ignores seller claims and only takes customer-reported vehicle data', () => {
    const state = deriveSalesState({
      history: [turn('عندنا تويوتا كامري ٢٠٢٤ تركيب', 1, 'OUTBOUND'),turn('تمام', 2)],
      automotiveBusiness: true,
    });
    expect(state.automotive?.make).toBeUndefined();
    expect(state.automotive?.year).toBeUndefined();
  });

  it('does not turn a Sahra vehicle into a SaaS marketing sales state', () => {
    const marketing = deriveSalesState({ history: [turn('I need 2 female models for reels')], automotiveBusiness: false });
    expect(marketing.deliverables).toContainEqual({ kind: 'MODEL', quantity: 2, detail: 'gender:female' });
    expect(marketing.automotive).toBeUndefined();
  });

  it('keeps the source IDs out of all AI runtime inputs while presenting vehicle facts', () => {
    const state = deriveSalesState({
      history: [turn('تويوتا ٢٠٢٢ عازل حراري', 1)],
      automotiveBusiness: true,
    });
    const llm = buildAgentInputForRuntime('secretary', {
      message: 'بكم يطلع؟',
      servingBusiness: { name: 'Sahra', countryCode: 'OM' },
      salesState: state,
    }, 12);
    const raw = JSON.stringify(llm);
    expect(raw).toContain('Toyota');
    expect(raw).toContain('2022');
    expect(raw).toContain('THERMAL_TINT');
    expect(raw).not.toContain('canonical-1');
    expect(raw).not.toContain('processedEvidenceIds');
  });

  it('does not guess the vehicle when two makes or models are discussed', () => {
    expect(inferAutomotiveFacts('عندكم فرش لتويوتا ولنيسان؟', at).make).toBeUndefined();
    expect(inferAutomotiveFacts('كامري وكورولا، شو الأفضل؟', at).model).toBeUndefined();
    expect(inferAutomotiveFacts('أبغي عازل وتلبيسات', at).service).toBeUndefined();
  });

  it('uses an explicit colloquial correction rather than guessing from both named services', () => {
    expect(inferAutomotiveFacts('لا قصدي عازل مو فرش', at).service).toBe('THERMAL_TINT');
    expect(inferAutomotiveFacts('لا قصدي فرشات الأرض مو دودي', at).service).toBe('FLOOR_MATS');
    expect(inferAutomotiveFacts('I mean tint not seat covers', at).service).toBe('THERMAL_TINT');
    expect(inferAutomotiveFacts('أبغي عازل وتلبيسات', at).service).toBeUndefined();
    expect(inferAutomotiveFacts('جامات', at).service).toBeUndefined();
    const history = [turn('أبغي فرش للاندكروزر ٢٠٢٢', 1),turn('لا قصدي عازل مو فرش', 2)];
    const state = deriveSalesState({ history, automotiveBusiness: true, language: 'ar-OM' });
    expect(state.automotive).toMatchObject({
      make: 'Toyota', model: 'Land Cruiser', year: 2022, service: 'THERMAL_TINT',
    });
  });

  it('accepts only a successfully transcribed voice for persistent customer vehicle facts', () => {
    const state = deriveSalesState({
      automotiveBusiness: true,
      history: [
        { ...turn('نيسان باترول ٢٠٢١', 1), mediaType: 'VOICE', mediaEvidenceStatus: 'UNAVAILABLE' },
        { ...turn('تويوتا كامري ٢٠٢٢', 2), mediaType: 'VOICE', mediaEvidenceStatus: 'TRANSCRIPT' },
        { ...turn('لاندكروزر ٢٠١٩', 3), mediaType: 'IMAGE', mediaEvidenceStatus: 'ANALYZED' },
      ],
    });
    expect(state.automotive).toMatchObject({ make: 'Toyota', model: 'Camry', year: 2022 });
  });

  it('records an explicitly stated customer budget but not an advertised price as their budget', () => {
    const state = deriveSalesState({
      automotiveBusiness: true,
      history: [turn('كم سعر التلبيس؟', 1), turn('ميزانيتي ٥٠ ريال', 2)],
    });
    expect(state.budget?.amount).toBe(50);
    expect(deriveSalesState({ automotiveBusiness: true, history: [turn('عرضكم ٩٩ ريال', 1)] }).budget).toBeUndefined();
  });

  it('backfills the existing Sahra conversation from already processed canonical customer turns', () => {
    const oldHistory = [
      turn('عندكم فرش أرضيات للاندكروزر؟', 1),
      turn('٢٠٢٢', 2),
      turn('خمس مقاعد', 3),
    ];
    const legacy = deriveSalesState({ history: oldHistory });
    expect(legacy.automotive).toBeUndefined();
    const migrated = deriveSalesState({ previous: legacy, history: oldHistory, automotiveBusiness: true });
    expect(migrated.automotive).toMatchObject({
      make: 'Toyota', model: 'Land Cruiser', year: 2022, seats: 5, service: 'FLOOR_MATS',
    });
    expect(migrated.processedEvidenceIds).toEqual(legacy.processedEvidenceIds);
  });

  it('cleans old marketing artifacts from pre-migration automotive sales state', () => {
    const legacy = deriveSalesState({ history: [turn('I need 2 female models and a website', 1)] });
    expect(legacy.deliverables.length).toBeGreaterThan(0);
    const repaired = deriveSalesState({
      previous: legacy,
      history: [turn('نيسان باترول ٢٠٢٢ عازل حراري', 2)],
      automotiveBusiness: true,
    });
    expect(repaired.deliverables).toEqual([]);
    expect(repaired.productionNeeds).toEqual([]);
    expect(repaired.selectedService).toBeUndefined();
    expect(repaired.automotive).toMatchObject({ make: 'Nissan', model: 'Patrol', year: 2022 });
  });

  it('keeps product listings strictly not offered until owner review and uses no synthetic quotes', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs/business-os-2027/sahra/OWNER_WHATSAPP_CATALOG_REVIEW_20261014.json'), 'utf8')) as {
      reviewState: string; products: Array<{ sku: string; availabilityMode: string; priceOmr: number|null; inventoryConfirmed: boolean }>;
    };
    expect(fixture.reviewState).toBe('OWNER_REVIEW_REQUIRED_NOT_IMPORTED');
    expect(fixture.products).toHaveLength(27);
    expect(new Set(fixture.products.map((p) => p.sku)).size).toBe(27);
    expect(fixture.products.every((p) => p.availabilityMode === 'NOT_OFFERED' && p.priceOmr === null && p.inventoryConfirmed === false)).toBe(true);
  });

  it('never turns price 99 OMR, 137 riyal or grade 5D into a manufacture year', () => {
    expect(inferAutomotiveFacts('99 OMR 7 مقاعد', at).year).toBeUndefined();
    expect(inferAutomotiveFacts('137 ريال فرش 5D', at).year).toBeUndefined();
    expect(inferAutomotiveFacts('موديل 2040', at).year).toBeUndefined();
  });
});
