import { describe, expect, it } from 'vitest';
import { parseCrmSegmentPredicateTree } from '@/lib/crm/segments';

describe('CRM Segment predicate contract', () => {
  it('accepts a bounded typed canonical tree', () => {
    const parsed = parseCrmSegmentPredicateTree({
      kind: 'GROUP',
      op: 'AND',
      children: [
        {
          kind: 'PREDICATE',
          source: 'CANONICAL',
          field: 'status',
          operator: 'IN',
          value: ['NEW', 'READY_TO_CONTACT'],
        },
        {
          kind: 'PREDICATE',
          source: 'CANONICAL',
          field: 'opportunity_score',
          operator: 'GTE',
          value: 60,
        },
      ],
    });

    expect(parsed).not.toBeNull();
  });

  it('accepts an INTERNAL-compatible custom-field predicate shape', () => {
    const parsed = parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CUSTOM_FIELD',
      definitionId: '10000000-0000-4000-8000-000000000001',
      definitionVersion: 2,
      dataType: 'SINGLE_SELECT',
      operator: 'IN',
      value: ['muscat', 'dubai'],
    });

    expect(parsed).not.toBeNull();
  });

  it('rejects arbitrary JSON/query keys', () => {
    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'status',
      operator: 'EQ',
      value: 'NEW',
      sql: 'drop table leads',
    })).toBeNull();

    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'metadata',
      operator: 'JSONPATH',
      value: '$.*',
    })).toBeNull();
  });

  it('rejects first-slice PII custom-field types', () => {
    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CUSTOM_FIELD',
      definitionId: '10000000-0000-4000-8000-000000000001',
      definitionVersion: 1,
      dataType: 'EMAIL',
      operator: 'EQ',
      value: 'person@example.test',
    })).toBeNull();

    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CUSTOM_FIELD',
      definitionId: '10000000-0000-4000-8000-000000000001',
      definitionVersion: 1,
      dataType: 'PHONE',
      operator: 'EQ',
      value: '+96812345678',
    })).toBeNull();
  });

  it('rejects oversized trees and invalid currency payloads', () => {
    const children = Array.from({ length: 21 }, () => ({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'status',
      operator: 'EQ',
      value: 'NEW',
    }));

    expect(parseCrmSegmentPredicateTree({
      kind: 'GROUP',
      op: 'AND',
      children,
    })).toBeNull();

    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CUSTOM_FIELD',
      definitionId: '10000000-0000-4000-8000-000000000001',
      definitionVersion: 1,
      dataType: 'CURRENCY',
      operator: 'BETWEEN',
      value: { min: 100, max: 50, currency: 'OMR' },
    })).toBeNull();
  });
});
