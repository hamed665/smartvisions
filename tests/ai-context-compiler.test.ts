import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildContextEvidenceManifest,
  projectBusinessTwinContext,
  projectCustomerContext,
  projectMemoryContext,
  projectToolAvailability,
} from '@/lib/agents/context-compiler';
import { buildAgentInputForRuntime } from '@/lib/agents/openai-runtime-core';
import type { AgentContext } from '@/lib/agents/contracts';

const hydrator = readFileSync('lib/agents/context-hydrator-core.ts', 'utf8');

describe('AI-CONTEXT-COMPILER', () => {
  it('extends the canonical hydrator instead of creating a second context authority', () => {
    expect(hydrator).toContain("rpc('compile_business_twin_v2'");
    expect(hydrator).toContain("rpc('get_memory_context_v2'");
    expect(hydrator).toContain("from('tool_action_registry')");
    expect(hydrator).toContain("from('crm_people')");
    expect(hydrator).not.toMatch(/from\(['"](?:context_store|agent_context_store|ai_context_store)['"]\)/);
  });

  it('projects only bounded Business Twin policy evidence, not the full Twin payload', () => {
    const projected = projectBusinessTwinContext({
      schemaVersion: 2,
      authority: 'CANONICAL_COMPOSITION',
      organization: { id: 'org-1', name: 'Smart Visions', brandName: 'SV' },
      configuration: [
        { scopeType: 'BUSINESS', key: 'PAYMENT_RULES', value: { shouldNotLeak: true }, version: 1 },
        { scopeType: 'ORGANIZATION', key: 'REFUND_POLICY', value: { text: 'case by case' }, version: 3 },
      ],
      sourceSummary: { serviceCount: 8, productCount: 0 },
      staff: { members: [{ userId: 'private-user' }] },
      commerce: { products: [{ metadata: { secret: 'not-for-agent-context' } }] },
    });

    expect(projected).toMatchObject({
      schemaVersion: 2,
      authority: 'CANONICAL_COMPOSITION',
      organization: { id: 'org-1', name: 'Smart Visions' },
      sourceSummary: { productCount: 0, serviceCount: 8 },
    });
    expect(projected?.policyConfiguration).toEqual([
      { scopeType: 'ORGANIZATION', key: 'REFUND_POLICY', value: { text: 'case by case' }, version: 3 },
    ]);
    expect(projected).not.toHaveProperty('staff');
    expect(projected).not.toHaveProperty('commerce');
  });

  it('bounds Memory payloads and count while preserving provenance and validity', () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      memory_key: `memory.key.${index}`,
      memory_type: index === 0 ? 'CUSTOMER' : 'EPISODIC',
      version: 1,
      payload: { note: 'x'.repeat(5000) },
      source_type: 'SYSTEM_DERIVED',
      source_ref: `source-${index}`,
      source_evidence: { reason: 'controlled' },
      confidence: 0.8,
      freshness_state: 'FRESH',
      sensitivity: 'INTERNAL',
      validity_state: 'ACTIVE',
    }));
    const memory = projectMemoryContext(rows);

    expect(memory).toHaveLength(24);
    expect((memory[0]?.payload as { note: string }).note.length).toBe(1000);
    expect(memory[0]).toMatchObject({
      key: 'memory.key.0',
      type: 'CUSTOMER',
      sourceType: 'SYSTEM_DERIVED',
      sourceEvidence: { reason: 'controlled' },
      freshnessState: 'FRESH',
      validityState: 'ACTIVE',
    });
  });

  it('keeps Customer context identity-light and relationship-bounded', () => {
    const customer = projectCustomerContext({
      person: {
        id: 'person-1',
        display_name: 'Customer',
        status: 'ACTIVE',
        metadata: { shouldNotLeak: true },
      },
      relationships: Array.from({ length: 12 }, (_, index) => ({
        id: `rel-${index}`,
        business_id: `business-${index}`,
        relationship_type: 'DECISION_MAKER',
        job_title: 'Owner',
        verification_method: 'MANUAL_CONFIRMED',
        status: 'ACTIVE',
        evidence: { shouldNotLeak: true },
      })),
    });

    expect(customer?.person).toEqual({ id: 'person-1', displayName: 'Customer', status: 'ACTIVE' });
    expect(customer?.relationships).toHaveLength(8);
    expect(customer).not.toHaveProperty('person.metadata');
    expect(customer?.relationships[0]).not.toHaveProperty('evidence');
  });

  it('surfaces Tool Registry capability metadata without schemas or authorization claims', () => {
    const tools = projectToolAvailability([
      {
        action_key: 'SEND_FOLLOWUP',
        tool_key: 'OUTREACH_SEND',
        authority_key: 'APPROVED_SEND_POLICY',
        contract_version: 1,
        input_schema: { secretShape: true },
        output_schema: { secretShape: true },
        permission_key: 'OUTBOUND_SEND',
        scope_type: 'CONVERSATION',
        cost_class: 'PROVIDER_METERED',
        side_effect_class: 'EXTERNAL_PROVIDER',
        approval_requirement: 'REQUIRED',
        approval_policy_key: 'OUTBOUND_SEND',
        verifier_key: 'PROVIDER_RECEIPT_RECONCILIATION',
        availability: 'DEPENDENCY_PENDING',
        required_work_packages: ['AUTO-APPROVAL', 'AUTO-RUNTIME'],
      },
    ]);

    expect(tools).toEqual([expect.objectContaining({
      actionKey: 'SEND_FOLLOWUP',
      permissionKey: 'OUTBOUND_SEND',
      availability: 'DEPENDENCY_PENDING',
      runtimeAuthorizationRequired: true,
    })]);
    expect(tools[0]).not.toHaveProperty('inputSchema');
    expect(tools[0]).not.toHaveProperty('outputSchema');
    expect(tools[0]).not.toHaveProperty('authorized');
  });

  it('builds a deterministic sorted evidence manifest', () => {
    const input = [
      { authority: 'MEMORY', count: 2, refs: ['b', 'a', 'a'] },
      { authority: 'CONVERSATION', count: 3, refs: ['conv-1'] },
    ];
    const first = buildContextEvidenceManifest(input);
    const second = buildContextEvidenceManifest([...input].reverse());
    expect(first).toEqual(second);
    expect(first.sources.map((source) => source.authority)).toEqual(['CONVERSATION', 'MEMORY']);
    expect(first.sources[1]?.refs).toEqual(['a', 'b']);
  });

  it('passes bounded compiler context to decision agents without turning tools into execution', () => {
    const context: AgentContext = {
      organizationId: 'org-1',
      message: 'Can you follow up tomorrow?',
      customerContext: { person: { id: 'person-1', status: 'ACTIVE' }, relationships: [] },
      memoryContext: Array.from({ length: 20 }, (_, index) => ({
        key: `m.${index}`, type: 'EPISODIC', version: 1, payload: { index },
        sourceType: 'SYSTEM_DERIVED', sourceRef: `s-${index}`,
      })),
      businessTwinContext: {
        schemaVersion: 2,
        authority: 'CANONICAL_COMPOSITION',
        policyConfiguration: [],
        sourceSummary: { serviceCount: 8 },
      },
      toolAvailability: [{
        actionKey: 'SEND_FOLLOWUP',
        toolKey: 'OUTREACH_SEND',
        authorityKey: 'APPROVED_SEND_POLICY',
        contractVersion: 1,
        permissionKey: 'OUTBOUND_SEND',
        scopeType: 'CONVERSATION',
        costClass: 'PROVIDER_METERED',
        sideEffectClass: 'EXTERNAL_PROVIDER',
        approvalRequirement: 'REQUIRED',
        approvalPolicyKey: 'OUTBOUND_SEND',
        verifierKey: 'PROVIDER_RECEIPT_RECONCILIATION',
        availability: 'DEPENDENCY_PENDING',
        requiredWorkPackages: ['AUTO-RUNTIME'],
        runtimeAuthorizationRequired: true,
      }],
      contextEvidence: buildContextEvidenceManifest([{ authority: 'MEMORY', count: 20 }]),
    };

    const input = buildAgentInputForRuntime('decision_orchestrator', context, 20) as {
      memoryContext?: unknown[];
      businessTwinContext?: unknown;
      toolAvailability?: unknown[];
      contextEvidence?: unknown;
    };
    expect(input.memoryContext).toHaveLength(12);
    expect(input.businessTwinContext).toEqual(context.businessTwinContext);
    expect(input.toolAvailability).toEqual(context.toolAvailability);
    expect(input.contextEvidence).toEqual(context.contextEvidence);
  });
});
