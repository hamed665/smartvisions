import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CRM_SEGMENT_ENTITY_TYPES,
  isCrmSegmentEntityType,
  parseCrmSegmentPredicateTree,
} from '@/lib/crm/segments';

describe('SEGMENT-V2 multi-entity governance', () => {
  const migration = readFileSync('supabase/migrations/0136_segment_v2_multi_entity.sql', 'utf8');
  const route = readFileSync('app/api/crm/segments/route.ts', 'utf8');
  const evaluateRoute = readFileSync('app/api/crm/segments/evaluate/route.ts', 'utf8');
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');

  it('extends the canonical Segment store instead of creating a second engine', () => {
    expect(migration).toContain('alter table public.crm_segments');
    expect(migration).toContain('create or replace function public.evaluate_crm_segment');
    expect(migration).not.toMatch(/create table (if not exists )?public\.crm_segment_(rules|memberships|members|results)/i);
    expect(migration).not.toMatch(/create table (if not exists )?public\.segments_v2/i);
  });

  it('supports only the justified canonical entity types', () => {
    expect(CRM_SEGMENT_ENTITY_TYPES).toEqual(['LEAD', 'PERSON', 'DEAL', 'ACCOUNT']);
    expect(isCrmSegmentEntityType('PERSON')).toBe(true);
    expect(isCrmSegmentEntityType('ORDER')).toBe(false);
  });

  it('accepts bounded Person lifecycle predicates but rejects PII/free metadata', () => {
    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'status',
      operator: 'IN',
      value: ['ACTIVE', 'RETIRED'],
    }, 'PERSON')).not.toBeNull();

    for (const field of ['display_name', 'email', 'phone', 'metadata']) {
      expect(parseCrmSegmentPredicateTree({
        kind: 'PREDICATE',
        source: 'CANONICAL',
        field,
        operator: 'EQ',
        value: 'private',
      }, 'PERSON')).toBeNull();
    }
  });

  it('accepts governed Deal predicates and Deal custom-field shapes', () => {
    expect(parseCrmSegmentPredicateTree({
      kind: 'GROUP',
      op: 'AND',
      children: [
        {
          kind: 'PREDICATE',
          source: 'CANONICAL',
          field: 'state',
          operator: 'EQ',
          value: 'OPEN',
        },
        {
          kind: 'PREDICATE',
          source: 'CANONICAL',
          field: 'amount',
          operator: 'GTE',
          value: 100,
        },
      ],
    }, 'DEAL')).not.toBeNull();

    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CUSTOM_FIELD',
      definitionId: '10000000-0000-4000-8000-000000000001',
      definitionVersion: 1,
      dataType: 'TEXT',
      operator: 'EQ',
      value: 'CONTRACT-1',
    }, 'DEAL')).not.toBeNull();
  });

  it('accepts bounded Account lifecycle predicates and rejects arbitrary enrichment', () => {
    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'account_lifecycle',
      operator: 'IN',
      value: ['PROSPECT', 'CUSTOMER'],
    }, 'ACCOUNT')).not.toBeNull();

    for (const field of ['email', 'phone', 'google_reviews', 'metadata', 'google_review_summary']) {
      expect(parseCrmSegmentPredicateTree({
        kind: 'PREDICATE',
        source: 'CANONICAL',
        field,
        operator: 'EQ',
        value: 'x',
      }, 'ACCOUNT')).toBeNull();
    }
  });

  it('requires canonical enum/code casing so validation and evaluation cannot disagree', () => {
    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'status',
      operator: 'EQ',
      value: 'active',
    }, 'PERSON')).toBeNull();

    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'currency',
      operator: 'EQ',
      value: 'omr',
    }, 'DEAL')).toBeNull();

    expect(parseCrmSegmentPredicateTree({
      kind: 'PREDICATE',
      source: 'CANONICAL',
      field: 'country_code',
      operator: 'EQ',
      value: 'om',
    }, 'ACCOUNT')).toBeNull();
  });

  it('does not pretend Person or Account custom-field authority exists', () => {
    const custom = {
      kind: 'PREDICATE',
      source: 'CUSTOM_FIELD',
      definitionId: '10000000-0000-4000-8000-000000000001',
      definitionVersion: 1,
      dataType: 'TEXT',
      operator: 'EQ',
      value: 'x',
    };
    expect(parseCrmSegmentPredicateTree(custom, 'PERSON')).toBeNull();
    expect(parseCrmSegmentPredicateTree(custom, 'ACCOUNT')).toBeNull();
  });

  it('keeps dynamic evaluation bounded and Snapshot separate', () => {
    expect(migration).toContain("evaluation_mode','DYNAMIC'");
    expect(migration).toContain('limit v_limit+1');
    expect(migration).toContain('No membership persistence');
    expect(migration).not.toMatch(/insert into public\.crm_segment_(members|memberships|snapshot)/i);
  });

  it('uses generic API contracts while preserving legacy Lead compatibility', () => {
    expect(route).toContain('createCrmSegment');
    expect(route).toContain('updateCrmSegmentDefinition');
    expect(route).toContain('setCrmSegmentLifecycle');
    expect(evaluateRoute).toContain('evaluateCrmSegment');
    expect(evaluateRoute).toContain('afterEntityId');
    expect(evaluateRoute).toContain('leadIds: evaluation.entityIds');
  });

  it('runs dedicated PostgreSQL 17 Segment V2 smoke', () => {
    expect(ci).toContain('crm-segment-v2-multi-entity-smoke.sql');
  });
});
