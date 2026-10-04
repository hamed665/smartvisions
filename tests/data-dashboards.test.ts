[Reading 68 lines from start (total: 68 lines, 0 remaining)]

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboard=readFileSync('lib/analytics/dashboard.ts','utf8');
const page=readFileSync('app/reports/page.tsx','utf8');

describe('DATA-DASHBOARDS',()=>{
  it('uses the governed Metrics Registry and Analytics Warehouse for historical metrics',()=>{
    expect(dashboard).toContain('listCurrentMetricDefinitions(service)');
    expect(dashboard).toContain('readAnalyticsWarehouse(service');
    expect(dashboard).toContain("source:'WAREHOUSE'");
    expect(page).toContain('Metrics Registry + Analytics Warehouse');
  });

  it('keeps historical and live current-state evidence explicitly separate',()=>{
    expect(dashboard).toContain("source:'LIVE_CANONICAL_STATE'");
    expect(page).toContain('source="LIVE"');
    expect(page).toContain('source="WAREHOUSE"');
    expect(dashboard).toContain('LIVE gauges are bounded canonical current-state counts');
  });

  it('never silently widens Business or Branch scope',()=>{
    expect(dashboard).toContain('Requested Business scope is not available to this user.');
    expect(dashboard).toContain('Requested Branch scope is not available to this user.');
    expect(dashboard).toContain('Requested Branch does not belong to the selected Business.');
    expect(dashboard).toContain('No broader number is substituted.');
    expect(page).toContain('Organization / Business / Branch scope is never silently widened.');
  });

  it('keeps unsupported response-time and retention metrics unavailable instead of guessing',()=>{
    expect(dashboard).toContain("unavailable('response_time'");
    expect(dashboard).toContain("unavailable('retention'");
    expect(dashboard).toContain('No governed response-time metric exists');
    expect(dashboard).toContain('No canonical retention/churn event definition exists');
    expect(page).toContain('Response time <strong>Unavailable</strong>');
    expect(page).toContain('Retention <strong>Unavailable</strong>');
  });

  it('does not read raw WhatsApp payloads or bulk OLTP message tables in the reports surface',()=>{
    expect(page).not.toContain("from('whatsapp_events')");
    expect(page).not.toContain("from('outreach_messages')");
    expect(page).not.toContain('payload');
    expect(dashboard).not.toContain("from('whatsapp_events')");
    expect(dashboard).not.toContain("from('outreach_messages')");
  });

  it('bounds the historical dashboard window and warehouse row count',()=>{
    expect(dashboard).toContain('[7,30,90].includes(days)?days:30');
    expect(dashboard).toContain('limit:10000');
    expect(dashboard).toContain('historyTruncated:facts.length>=10000');
    expect(page).toContain('History cap');
  });

  it('keeps cross-currency revenue separate',()=>{
    expect(dashboard).toContain("definition.unit==='MONEY'&&units.length>1");
    expect(dashboard).toContain('no cross-currency total is manufactured');
    expect(page).toContain('Currencies remain separate. No OMR/USD/AED total is manufactured.');
  });

  it('covers the required dashboard domains without creating a dashboard truth store',()=>{
    for(const label of [
      'Leads','Customers / people','Conversations','Response time','Sales & pipeline',
      'Bookings','Quotes','Orders','Payments & revenue','Retention','Staff, workflow & campaigns',
      'Channels','AI',
    ])expect(page).toContain(label);
    expect(dashboard).not.toMatch(/dashboard_(facts|events|snapshots|metrics)/i);
  });
});

[executed on device: vps-eae2ade9 (4241b720-b387-477b-bb4f-5ea2a25fa2a6)]