import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCatalogComposerText } from '@/lib/telegram/catalog-composer';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { parseTelegramOwnerCommand } from '@/lib/telegram/parser';

describe('Telegram Owner Catalog Composer', () => {
  it('only enters catalog mutation mode behind an explicit owner trigger and preserves multiline text', () => {
    const command = parseTelegramOwnerCommand('/catalog\nپکیج محتوا عمان\n4 ریلز 49 ریال');
    expect(command).toEqual({
      type: 'CATALOG_COMPOSE',
      rawText: 'پکیج محتوا عمان\n4 ریلز 49 ریال',
    });
    expect(MUTATING_COMMANDS.has('CATALOG_COMPOSE')).toBe(true);
    expect(parseTelegramOwnerCommand('4 ریلز 49 ریال').type).not.toBe('CATALOG_COMPOSE');
  });

  it('parses a realistic Persian Oman catalog brief deterministically', () => {
    const draft = parseCatalogComposerText([
      'پکیج محتوا عمان',
      '۴ ریلز ۴۹ ریال',
      '۸ ریلز ۸۹ ریال',
      'هر تعداد بیشتر custom quote',
      'استوری هر تعداد قابل سفارش',
      'فیلمبردار داریم با هماهنگی',
      'عکاس داریم با هماهنگی',
      'مدل زن و مرد قابل هماهنگی',
      'بازیگر قابل هماهنگی',
      'قیمت مدل و فیلمبردار توافقی',
      'لوکیشن و تاریخ قبل از قیمت نهایی گرفته شود',
    ].join('\n'));

    expect(draft.countryCode).toBe('OM');
    expect(draft.currency).toBe('OMR');
    expect(draft.packages).toEqual(expect.arrayContaining([
      expect.objectContaining({ reels: 4, price: 49 }),
      expect.objectContaining({ reels: 8, price: 89 }),
    ]));
    expect(draft.flexibleReels).toBe(true);
    expect(draft.flexibleStories).toBe(true);
    expect(draft.capabilities.videographer).toEqual(expect.objectContaining({ enabled: true, pricingMode: 'CUSTOM_QUOTE' }));
    expect(draft.capabilities.photographer).toEqual(expect.objectContaining({ enabled: true }));
    expect(draft.capabilities.model).toEqual(expect.objectContaining({ enabled: true, pricingMode: 'CUSTOM_QUOTE' }));
    expect(draft.capabilities.actor).toEqual(expect.objectContaining({ enabled: true }));
    expect(draft.intakeRequiredFields).toEqual(expect.arrayContaining(['location', 'shootDate']));
    expect(draft.unresolved).toEqual([]);
  });

  it('fails closed instead of guessing unknown lines or mixed markets', () => {
    const unknown = parseCatalogComposerText('عمان\nیه پکیج خیلی خفن هرچی خودت صلاح دونستی');
    expect(unknown.unresolved.length).toBeGreaterThan(0);

    const mixed = parseCatalogComposerText('عمان UAE\n4 reels OMR 49');
    expect(mixed.unresolved.some((line) => line.includes('چند بازار'))).toBe(true);
  });

  it('keeps availability and pricing claims conservative', () => {
    const draft = parseCatalogComposerText([
      'content catalog Oman',
      'videographer available subject to coordination',
      'model custom quote',
    ].join('\n'));
    expect(draft.capabilities.videographer).toEqual(expect.objectContaining({
      enabled: true,
      requiresAvailabilityConfirmation: true,
    }));
    expect(draft.unresolved.length).toBeGreaterThan(0);
  });

  it('ships the atomic RPC with optimistic concurrency and service-role-only execution', () => {
    const migration = readFileSync('supabase/migrations/0061_atomic_owner_catalog_composer.sql', 'utf8');
    expect(migration).toContain('apply_owner_catalog_batch');
    expect(migration).toContain('catalog preview is stale');
    expect(migration).toContain('security invoker');
    expect(migration).toContain('revoke all on function public.apply_owner_catalog_batch(uuid, jsonb, text) from authenticated');
    expect(migration).toContain('grant execute on function public.apply_owner_catalog_batch(uuid, jsonb, text) to service_role');
    expect(migration).not.toContain('security definer');
  });
});
