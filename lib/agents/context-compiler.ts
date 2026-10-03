import type {
  BusinessTwinContextSnapshot,
  ContextEvidenceManifest,
  ContextEvidenceSource,
  CustomerContextSnapshot,
  MemoryContextSnapshot,
  ToolAvailabilitySnapshot,
} from './contracts';

const clip = (value: unknown, max = 1000) => String(value ?? '').trim().slice(0, max);

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function boundedContextValue(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (depth >= 3) return clip(JSON.stringify(value), 1200);
  if (Array.isArray(value)) return value.slice(0, 12).map((item) => boundedContextValue(item, depth + 1));
  const source = record(value);
  if (!source) return clip(value, 1000);
  return Object.fromEntries(
    Object.keys(source)
      .sort()
      .slice(0, 20)
      .map((key) => [key, boundedContextValue(source[key], depth + 1)]),
  );
}

export function projectCustomerContext(input: {
  person?: Record<string, unknown> | null;
  relationships?: Array<Record<string, unknown>>;
}): CustomerContextSnapshot | undefined {
  const personId = clip(input.person?.id, 80);
  const relationships = (input.relationships ?? [])
    .map((row) => ({
      id: clip(row.id, 80),
      businessId: clip(row.business_id, 80),
      relationshipType: clip(row.relationship_type, 80) || undefined,
      jobTitle: clip(row.job_title, 160) || undefined,
      verificationMethod: clip(row.verification_method, 80) || undefined,
      status: clip(row.status, 40) || undefined,
    }))
    .filter((item) => item.id && item.businessId)
    .slice(0, 8);

  if (!personId && relationships.length === 0) return undefined;
  return {
    ...(personId ? {
      person: {
        id: personId,
        displayName: clip(input.person?.display_name, 240) || undefined,
        status: clip(input.person?.status, 40) || undefined,
      },
    } : {}),
    relationships,
  };
}

export function projectMemoryContext(rows: Array<Record<string, unknown>>): MemoryContextSnapshot[] {
  return rows
    .flatMap((row): MemoryContextSnapshot[] => {
      const key = clip(row.memory_key, 180);
      const type = clip(row.memory_type, 80).toUpperCase();
      const version = finiteNumber(row.version) ?? 0;
      if (!key || !type || version < 1) return [];

      const sourceEvidence = record(boundedContextValue(row.source_evidence));
      const confidence = finiteNumber(row.confidence);
      const observedAt = clip(row.observed_at, 80);
      const freshUntil = clip(row.fresh_until, 80);
      const freshnessState = clip(row.freshness_state, 40);
      const sensitivity = clip(row.sensitivity, 40);
      const validFrom = clip(row.valid_from, 80);
      const validUntil = clip(row.valid_until, 80);
      const expiresAt = clip(row.expires_at, 80);
      const validityState = clip(row.validity_state, 40);
      const correctionSemantics = clip(row.correction_semantics, 80);
      const memoryId = clip(row.memory_id, 80);
      const personId = clip(row.person_id, 80);
      const businessId = clip(row.business_id, 80);
      const conversationId = clip(row.conversation_id, 80);

      const item: MemoryContextSnapshot = {
        key,
        type,
        version,
        payload: boundedContextValue(row.payload),
        sourceType: clip(row.source_type, 80),
        sourceRef: clip(row.source_ref, 300),
        ...(sourceEvidence ? { sourceEvidence } : {}),
        ...(confidence == null ? {} : { confidence }),
        ...(observedAt ? { observedAt } : {}),
        ...(freshUntil ? { freshUntil } : {}),
        ...(freshnessState ? { freshnessState } : {}),
        ...(sensitivity ? { sensitivity } : {}),
        ...(validFrom ? { validFrom } : {}),
        ...(validUntil ? { validUntil } : {}),
        ...(expiresAt ? { expiresAt } : {}),
        ...(validityState ? { validityState } : {}),
        ...(correctionSemantics ? { correctionSemantics } : {}),
        ...(memoryId ? { memoryId } : {}),
        ...(personId ? { personId } : {}),
        ...(businessId ? { businessId } : {}),
        ...(conversationId ? { conversationId } : {}),
      };
      return [item];
    })
    .slice(0, 24);
}

export function projectBusinessTwinContext(raw: unknown): BusinessTwinContextSnapshot | undefined {
  const twin = record(raw);
  if (!twin) return undefined;
  const organization = record(twin.organization);
  const configuration = Array.isArray(twin.configuration) ? twin.configuration : [];
  const policyConfiguration = configuration
    .map((item) => record(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => clip(item.scopeType, 40).toUpperCase() === 'ORGANIZATION')
    .map((item) => ({
      scopeType: 'ORGANIZATION',
      key: clip(item.key, 120).toUpperCase(),
      value: boundedContextValue(item.value),
      ...(finiteNumber(item.version) == null ? {} : { version: finiteNumber(item.version) }),
    }))
    .filter((item) => item.key)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 16);

  const rawSummary = record(twin.sourceSummary) ?? {};
  const sourceSummary = Object.fromEntries(
    Object.keys(rawSummary)
      .sort()
      .slice(0, 24)
      .flatMap((key) => {
        const value = finiteNumber(rawSummary[key]);
        return value == null ? [] : [[key, value]];
      }),
  );

  const id = clip(organization?.id, 80);
  const name = clip(organization?.name, 240);
  const brandName = clip(organization?.brandName, 240);
  return {
    ...(finiteNumber(twin.schemaVersion) == null ? {} : { schemaVersion: finiteNumber(twin.schemaVersion) }),
    authority: clip(twin.authority, 80) || undefined,
    ...((id || name || brandName) ? {
      organization: {
        id: id || undefined,
        name: name || undefined,
        brandName: brandName || undefined,
      },
    } : {}),
    policyConfiguration,
    sourceSummary,
  };
}

export function projectToolAvailability(rows: Array<Record<string, unknown>>): ToolAvailabilitySnapshot[] {
  return rows
    .map((row) => ({
      actionKey: clip(row.action_key, 128),
      toolKey: clip(row.tool_key, 128),
      authorityKey: clip(row.authority_key, 128),
      contractVersion: finiteNumber(row.contract_version) ?? 0,
      permissionKey: clip(row.permission_key, 128),
      scopeType: clip(row.scope_type, 80),
      costClass: clip(row.cost_class, 80),
      sideEffectClass: clip(row.side_effect_class, 80),
      approvalRequirement: clip(row.approval_requirement, 80),
      approvalPolicyKey: clip(row.approval_policy_key, 128) || undefined,
      verifierKey: clip(row.verifier_key, 128),
      availability: clip(row.availability, 80),
      requiredWorkPackages: Array.isArray(row.required_work_packages)
        ? row.required_work_packages.filter((item): item is string => typeof item === 'string').slice(0, 12)
        : [],
      runtimeAuthorizationRequired: true as const,
    }))
    .filter((item) => item.actionKey && item.toolKey && item.contractVersion > 0)
    .sort((a, b) => a.actionKey.localeCompare(b.actionKey))
    .slice(0, 32);
}

export function buildContextEvidenceManifest(sources: ContextEvidenceSource[]): ContextEvidenceManifest {
  return {
    schemaVersion: 1,
    sources: sources
      .map((source) => ({
        authority: clip(source.authority, 120),
        ...(source.count == null ? {} : { count: Math.max(0, Math.trunc(source.count)) }),
        ...(source.version == null ? {} : { version: source.version }),
        ...(source.refs ? { refs: [...new Set(source.refs.map((ref) => clip(ref, 180)).filter(Boolean))].sort().slice(0, 32) } : {}),
      }))
      .filter((source) => source.authority)
      .sort((a, b) => a.authority.localeCompare(b.authority)),
  };
}

export function memoryForRuntime(memory: MemoryContextSnapshot[] | undefined, limit = 12) {
  return (memory ?? []).slice(0, Math.max(0, Math.min(limit, 16)));
}
