import { describe, expect, it } from 'vitest';

import type { FounderStatusSnapshotV1 } from '@/lib/founder/contracts';
import {
  founderStatusModelPayload,
  normalizeFounderHistory,
  parseFounderIntelligence,
} from '@/lib/founder/intelligence-core';

const status: FounderStatusSnapshotV1 = {
  schemaVersion: 1,
  mode: 'READ_ONLY',
  generatedAt: '2026-10-03T10:00:00.000Z',
  operatingMode: 'SHADOW',
  product: {
    enabledIntegrations: 2,
    unhealthyEnabledIntegrations: 0,
    aiRegisteredActions: 7,
    activeKnowledgeVersions: 1,
    activeMemoryItems: 3,
    pendingMemoryItems: 1,
    agentRuns30d: 20,
    failedAgentRuns30d: 1,
  },
  sales: {
    leads: 12,
    qualifiedLeads: 4,
    wonLeads: 0,
    conversations: 9,
    tasks: 5,
    activeBookings: 1,
    quotes: 2,
    orders: 0,
    invoices: 0,
    paymentTransactions: 0,
  },
  finance: {
    monthSpendUsd: 1.25,
    monthlyBudgetUsd: 25,
    budgetUtilizationPct: 5,
  },
  attention: [{
    key: 'qualified-no-wins',
    level: 'WATCH',
    title: 'Qualified pipeline has no observed wins yet',
    detail: 'Observed canonical pipeline evidence.',
    evidence: ['CRM_PIPELINE'],
  }],
  evidence: [
    { authority: 'SYSTEM_CONTROLS', quality: 'VERIFIED' },
    { authority: 'CRM_PIPELINE', quality: 'VERIFIED', count: 12 },
    { authority: 'COST_GUARD', quality: 'VERIFIED' },
  ],
};

describe('Founder intelligence evidence boundary', () => {
  it('filters invented evidence authorities instead of laundering model claims into sources', () => {
    const result = parseFounderIntelligence({
      status,
      raw: {
        question_kind: 'NEXT',
        answer: 'Focus on converting the qualified pipeline.',
        facts: [
          { text: '4 qualified leads', authority: 'CRM_PIPELINE' },
          { text: '0 won leads', authority: 'CRM_PIPELINE' },
          { text: 'Market size is huge', authority: 'INVENTED_WEB_SOURCE' },
        ],
        gaps: [],
        next_action: 'Review qualified leads.',
        kpi: 'Observed won lead count.',
        risks: ['Pipeline counts do not prove causality.'],
        confidence: 'HIGH',
      },
      nowIso: '2026-10-03T10:01:00.000Z',
    });

    expect(result.mode).toBe('READ_ONLY_ANALYSIS');
    expect(result.facts).toEqual([
      { text: '4 qualified leads', authority: 'CRM_PIPELINE' },
      { text: '0 won leads', authority: 'CRM_PIPELINE' },
    ]);
    expect(result.evidenceAuthorities).toEqual(['CRM_PIPELINE']);
    expect(result.evidenceAuthorities).not.toContain('INVENTED_WEB_SOURCE');
    expect(result.generatedAt).toBe('2026-10-03T10:01:00.000Z');
  });

  it('downgrades unsupported high confidence when gaps dominate available facts', () => {
    const result = parseFounderIntelligence({
      status,
      raw: {
        question_kind: 'INVESTOR',
        answer: 'External investor evidence is missing.',
        facts: [{ text: 'The snapshot has canonical pipeline evidence.', authority: 'CRM_PIPELINE' }],
        gaps: ['Investor pipeline', 'Runway', 'External market benchmark'],
        next_action: 'Collect the missing evidence.',
        kpi: 'Investor readiness evidence coverage.',
        risks: [],
        confidence: 'HIGH',
      },
    });

    expect(result.confidence).toBe('MEDIUM');
    expect(result.gaps).toHaveLength(3);
  });

  it('drops facts that cite missing or unverified evidence authorities', () => {
    const result = parseFounderIntelligence({
      status: {
        ...status,
        evidence: [
          ...status.evidence,
          { authority: 'EXTERNAL_MARKET', quality: 'MISSING' },
        ],
      },
      raw: {
        question_kind: 'MARKET',
        answer: 'External market evidence is missing.',
        facts: [
          { text: '12 leads are present in the canonical pipeline.', authority: 'CRM_PIPELINE' },
          { text: 'The market is worth 10B.', authority: 'EXTERNAL_MARKET' },
        ],
        gaps: ['Governed external market research'],
        next_action: 'Collect external market evidence.',
        kpi: 'Verified market sources.',
        risks: [],
        confidence: 'HIGH',
      },
    });

    expect(result.facts).toEqual([
      { text: '12 leads are present in the canonical pipeline.', authority: 'CRM_PIPELINE' },
    ]);
    expect(result.evidenceAuthorities).toEqual(['CRM_PIPELINE']);
  });

  it('bounds conversational history and drops malformed turns', () => {
    const history = normalizeFounderHistory([
      { role: 'user', text: 'old 1' },
      { role: 'assistant', text: 'old 2' },
      { role: 'system', text: 'must be ignored' },
      { role: 'user', text: '3' },
      { role: 'assistant', text: '4' },
      { role: 'user', text: '5' },
      { role: 'assistant', text: '6' },
      { role: 'user', text: '7' },
      { role: 'assistant', text: '8' },
    ]);
    expect(history).toHaveLength(6);
    expect(history[0]?.text).toBe('3');
    expect(history.at(-1)?.text).toBe('8');
  });

  it('passes only bounded canonical founder status fields into model context', () => {
    const payload = founderStatusModelPayload(status);
    expect(payload.mode).toBe('READ_ONLY');
    expect(payload.operatingMode).toBe('SHADOW');
    expect(payload.sales.qualifiedLeads).toBe(4);
    expect(payload.evidence.map((item) => item.authority)).toContain('CRM_PIPELINE');
    expect(payload.investorReadiness.mode).toBe('READ_ONLY_EVIDENCE');
    expect(payload.investorReadiness.items.find((item) => item.key === 'COMPANY_FINANCIALS')?.state).toBe('MISSING');
    expect(payload).not.toHaveProperty('rawRows');
  });
});
