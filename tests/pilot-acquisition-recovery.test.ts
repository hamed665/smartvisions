import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRecoveredPilotDiscovery,
  findOldestUnreconciledPilotDiscovery,
} from '@/lib/operations/pilot-acquisition-recovery';

describe('pilot acquisition settled-ledger recovery', () => {
  it('selects the oldest unreconciled pilot journal and ignores settled/non-pilot rows', () => {
    const result = findOldestUnreconciledPilotDiscovery([
      {
        id: 'newer',
        source_id: 'place-newer',
        raw_payload: { autoAcquisitionPilot: true },
        discovered_at: '2026-09-05T12:20:00.000Z',
      },
      {
        id: 'settled',
        source_id: 'place-settled',
        raw_payload: { autoAcquisitionPilot: true, detailsLookupCharged: true },
        discovered_at: '2026-09-05T12:00:00.000Z',
      },
      {
        id: 'non-pilot',
        source_id: 'place-other',
        raw_payload: {},
        discovered_at: '2026-09-05T11:00:00.000Z',
      },
      {
        id: 'older',
        source_id: 'place-older',
        raw_payload: { autoAcquisitionPilot: true, detailsLookupCharged: false },
        discovered_at: '2026-09-05T12:10:00.000Z',
      },
    ]);

    expect(result?.id).toBe('older');
  });

  it('reconstructs a Tier A journal from persisted growth evidence without enabling outreach', () => {
    const recovered = buildRecoveredPilotDiscovery({
      journalRaw: {
        autoAcquisitionPilot: true,
        providerSendTriggered: false,
        placeId: 'place-1',
      },
      recoveredAt: '2026-09-05T12:30:00.000Z',
      settledAt: '2026-09-05T12:20:39.472Z',
      settledUsageEventId: 'usage-1',
      businessId: 'business-1',
      leadId: 'lead-1',
      marketCatalog: new Set(['business_website']),
      growth: {
        sales_lane: 'MUSCAT_LOCAL_GROWTH',
        service_region: 'MUSCAT_LOCAL',
        overall_sales_score: 94,
        prospect_tier: 'A',
        qualification_score: 94,
        qualification_confidence: 93,
        primary_offer_family: 'WEBSITE_BUILD',
        primary_service_id: 'business_website',
        should_contact: true,
        evidence_gaps: ['SOCIAL_QUALITY_CHECK_REQUIRED'],
        personalization_fingerprint: ['DENTAL', 'Muscat'],
        cheapest_next_action: 'CONTACT_READY',
      },
    });

    expect(recovered.priorityQualified).toBe(true);
    expect(recovered.qualificationReason).toBe('TIER_A_WEBSITE_BUILD');
    expect(recovered.rawPayload).toMatchObject({
      detailsLookupCharged: true,
      recoverySource: 'SETTLED_COST_LEDGER',
      settledUsageEventId: 'usage-1',
      businessId: 'business-1',
      leadId: 'lead-1',
      providerSendTriggered: false,
      outboundDraftQueued: false,
      priorityQualified: true,
    });
  });

  it('does not mark a recovered result priority-qualified when the canonical service is absent from the market catalog', () => {
    const recovered = buildRecoveredPilotDiscovery({
      journalRaw: { autoAcquisitionPilot: true },
      recoveredAt: '2026-09-05T12:30:00.000Z',
      settledUsageEventId: 'usage-2',
      businessId: 'business-2',
      leadId: null,
      marketCatalog: new Set(),
      growth: {
        sales_lane: 'MUSCAT_LOCAL_GROWTH',
        service_region: 'MUSCAT_LOCAL',
        overall_sales_score: 90,
        prospect_tier: 'A',
        qualification_score: 90,
        qualification_confidence: 90,
        primary_offer_family: 'WEBSITE_BUILD',
        primary_service_id: 'business_website',
        should_contact: true,
        evidence_gaps: [],
        personalization_fingerprint: [],
        cheapest_next_action: 'CONTACT_READY',
      },
    });

    expect(recovered.priorityQualified).toBe(false);
    expect(recovered.rawPayload.providerSendTriggered).toBe(false);
  });

  it('keeps deterministic recovery ahead of every new Google Places qualification call', () => {
    const route = fs.readFileSync(
      path.join(process.cwd(), 'app/api/operations/pilot-acquisition/route.ts'),
      'utf8',
    );
    const recoveryIndex = route.indexOf('const unreconciled = findOldestUnreconciledPilotDiscovery');
    const providerIndex = route.indexOf('const search = await controlledGooglePlacesIdSearch');

    expect(recoveryIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeGreaterThan(-1);
    expect(recoveryIndex).toBeLessThan(providerIndex);
    expect(route).toContain("accounting_state: 'SETTLED'");
    expect(route).toContain('newProviderCallTriggered: false');
  });

  it('grants only the missing discovery UPDATE privilege to service_role', () => {
    const raw = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/0058_pilot_discovery_reconciliation_grant.sql'),
      'utf8',
    ).toLowerCase();
    const sql = raw
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n');

    expect(sql).toMatch(/grant update on table public\.discovery_records to service_role;/);
    expect(sql).not.toMatch(/grant\s+all/);
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*to service_role/);
    expect(sql).not.toMatch(/grant[^;]*insert[^;]*to service_role/);
  });
});
