import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  ControlPlaneBootstrapError,
  requireOrganizationOwner,
} from '@/lib/business-os/control-plane-bootstrap';
import { isUuid } from '@/lib/chatwoot/tenant-bridge';

const CODE_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

type HierarchyStatus = 'ACTIVE' | 'ARCHIVED';

export type BranchRow = {
  id: string;
  organization_id: string;
  tenant_business_id: string;
  name: string;
  code: string;
  country_code: string | null;
  timezone: string | null;
  status: HierarchyStatus;
  metadata: Record<string, unknown>;
};

export type DepartmentRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  name: string;
  code: string;
  status: HierarchyStatus;
  metadata: Record<string, unknown>;
};

export type TeamRow = {
  id: string;
  organization_id: string;
  department_id: string;
  name: string;
  code: string;
  status: HierarchyStatus;
  metadata: Record<string, unknown>;
};

function invalid(message: string): never {
  throw new ControlPlaneBootstrapError('INVALID', message);
}

function normalizeName(value: unknown, field: string) {
  if (typeof value !== 'string') invalid(field + ' must be a string');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 160) {
    invalid(field + ' has an invalid length');
  }
  return normalized;
}

function normalizeCode(value: unknown, field: string) {
  if (typeof value !== 'string') invalid(field + ' must be a string');
  const normalized = value.trim().toLowerCase();
  if (!CODE_RE.test(normalized)) {
    invalid(field + ' must match the canonical code format');
  }
  return normalized;
}

function normalizeCountryCode(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') invalid('countryCode must be a string');
  const normalized = value.trim().toUpperCase();
  if (!COUNTRY_CODE_RE.test(normalized)) {
    invalid('countryCode must be an ISO alpha-2 code');
  }
  return normalized;
}

function normalizeTimezone(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') invalid('timezone must be a string');
  const normalized = value.trim();
  if (!normalized || normalized.length > 80) invalid('timezone is invalid');

  try {
    new Intl.DateTimeFormat('en', { timeZone: normalized }).format();
  } catch {
    invalid('timezone must be a valid IANA timezone');
  }

  return normalized;
}

function normalizeUuid(value: unknown, field: string) {
  if (typeof value !== 'string' || !isUuid(value.trim())) {
    invalid(field + ' must be a UUID');
  }
  return value.trim();
}

function emptyMetadata() {
  return {} as Record<string, unknown>;
}

function sameMetadata(value: unknown) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value as Record<string, unknown>).length === 0
  );
}

async function requireActiveBusiness(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
}) {
  const { data, error } = await input.supabase
    .from('tenant_businesses')
    .select('id,organization_id,country_code,timezone,status')
    .eq('organization_id', input.organizationId)
    .eq('id', input.tenantBusinessId)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError(
      'DATABASE',
      'Unable to verify parent Business',
    );
  }

  if (
    !data ||
    data.organization_id !== input.organizationId ||
    data.status !== 'ACTIVE'
  ) {
    throw new ControlPlaneBootstrapError(
      'NOT_FOUND',
      'An ACTIVE tenant Business in the same Organization is required',
    );
  }

  return data;
}

async function loadBranch(input: {
  supabase: SupabaseClient;
  organizationId: string;
  tenantBusinessId: string;
  code: string;
}) {
  const { data, error } = await input.supabase
    .from('branches')
    .select(
      'id,organization_id,tenant_business_id,name,code,country_code,timezone,status,metadata',
    )
    .eq('organization_id', input.organizationId)
    .eq('tenant_business_id', input.tenantBusinessId)
    .eq('code', input.code)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError('DATABASE', 'Unable to read Branch state');
  }

  return (data ?? null) as BranchRow | null;
}

async function loadDepartment(input: {
  supabase: SupabaseClient;
  organizationId: string;
  branchId: string;
  code: string;
}) {
  const { data, error } = await input.supabase
    .from('departments')
    .select('id,organization_id,branch_id,name,code,status,metadata')
    .eq('organization_id', input.organizationId)
    .eq('branch_id', input.branchId)
    .eq('code', input.code)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError(
      'DATABASE',
      'Unable to read Department state',
    );
  }

  return (data ?? null) as DepartmentRow | null;
}

async function loadTeam(input: {
  supabase: SupabaseClient;
  organizationId: string;
  departmentId: string;
  code: string;
}) {
  const { data, error } = await input.supabase
    .from('teams')
    .select('id,organization_id,department_id,name,code,status,metadata')
    .eq('organization_id', input.organizationId)
    .eq('department_id', input.departmentId)
    .eq('code', input.code)
    .maybeSingle();

  if (error) {
    throw new ControlPlaneBootstrapError('DATABASE', 'Unable to read Team state');
  }

  return (data ?? null) as TeamRow | null;
}

export async function bootstrapOperatingHierarchy(input: {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  tenantBusinessId: string;
  branchName: unknown;
  branchCode: unknown;
  branchCountryCode?: unknown;
  branchTimezone?: unknown;
  departmentName: unknown;
  departmentCode: unknown;
  teamName: unknown;
  teamCode: unknown;
}) {
  const organizationId = normalizeUuid(input.organizationId, 'organizationId');
  const tenantBusinessId = normalizeUuid(
    input.tenantBusinessId,
    'tenantBusinessId',
  );

  await requireOrganizationOwner({
    supabase: input.supabase,
    organizationId,
    userId: normalizeUuid(input.userId, 'userId'),
  });

  const business = await requireActiveBusiness({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
  });

  const branchName = normalizeName(input.branchName, 'branchName');
  const branchCode = normalizeCode(input.branchCode, 'branchCode');
  const branchCountryCode =
    normalizeCountryCode(input.branchCountryCode) ??
    normalizeCountryCode(business.country_code);
  const branchTimezone =
    normalizeTimezone(input.branchTimezone) ??
    normalizeTimezone(business.timezone);

  let branch = await loadBranch({
    supabase: input.supabase,
    organizationId,
    tenantBusinessId,
    code: branchCode,
  });
  let branchCreated = false;

  if (branch) {
    if (
      branch.name !== branchName ||
      branch.status !== 'ACTIVE' ||
      branch.country_code !== branchCountryCode ||
      branch.timezone !== branchTimezone ||
      !sameMetadata(branch.metadata)
    ) {
      throw new ControlPlaneBootstrapError(
        'CONFLICT',
        'Branch code already exists with different canonical data',
      );
    }
  } else {
    const { data, error } = await input.supabase
      .from('branches')
      .insert({
        organization_id: organizationId,
        tenant_business_id: tenantBusinessId,
        name: branchName,
        code: branchCode,
        country_code: branchCountryCode,
        timezone: branchTimezone,
        status: 'ACTIVE',
        metadata: emptyMetadata(),
      })
      .select(
        'id,organization_id,tenant_business_id,name,code,country_code,timezone,status,metadata',
      )
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        branch = await loadBranch({
          supabase: input.supabase,
          organizationId,
          tenantBusinessId,
          code: branchCode,
        });
      }
      if (
        !branch ||
        branch.name !== branchName ||
        branch.status !== 'ACTIVE' ||
        branch.country_code !== branchCountryCode ||
        branch.timezone !== branchTimezone ||
        !sameMetadata(branch.metadata)
      ) {
        throw new ControlPlaneBootstrapError('DATABASE', 'Branch creation failed');
      }
    } else {
      branch = data as BranchRow;
      branchCreated = true;
    }
  }

  const departmentName = normalizeName(input.departmentName, 'departmentName');
  const departmentCode = normalizeCode(input.departmentCode, 'departmentCode');
  let department = await loadDepartment({
    supabase: input.supabase,
    organizationId,
    branchId: branch.id,
    code: departmentCode,
  });
  let departmentCreated = false;

  if (department) {
    if (
      department.name !== departmentName ||
      department.status !== 'ACTIVE' ||
      !sameMetadata(department.metadata)
    ) {
      throw new ControlPlaneBootstrapError(
        'CONFLICT',
        'Department code already exists with different canonical data',
      );
    }
  } else {
    const { data, error } = await input.supabase
      .from('departments')
      .insert({
        organization_id: organizationId,
        branch_id: branch.id,
        name: departmentName,
        code: departmentCode,
        status: 'ACTIVE',
        metadata: emptyMetadata(),
      })
      .select('id,organization_id,branch_id,name,code,status,metadata')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        department = await loadDepartment({
          supabase: input.supabase,
          organizationId,
          branchId: branch.id,
          code: departmentCode,
        });
      }
      if (
        !department ||
        department.name !== departmentName ||
        department.status !== 'ACTIVE' ||
        !sameMetadata(department.metadata)
      ) {
        throw new ControlPlaneBootstrapError(
          'DATABASE',
          'Department creation failed',
        );
      }
    } else {
      department = data as DepartmentRow;
      departmentCreated = true;
    }
  }

  const teamName = normalizeName(input.teamName, 'teamName');
  const teamCode = normalizeCode(input.teamCode, 'teamCode');
  let team = await loadTeam({
    supabase: input.supabase,
    organizationId,
    departmentId: department.id,
    code: teamCode,
  });
  let teamCreated = false;

  if (team) {
    if (
      team.name !== teamName ||
      team.status !== 'ACTIVE' ||
      !sameMetadata(team.metadata)
    ) {
      throw new ControlPlaneBootstrapError(
        'CONFLICT',
        'Team code already exists with different canonical data',
      );
    }
  } else {
    const { data, error } = await input.supabase
      .from('teams')
      .insert({
        organization_id: organizationId,
        department_id: department.id,
        name: teamName,
        code: teamCode,
        status: 'ACTIVE',
        metadata: emptyMetadata(),
      })
      .select('id,organization_id,department_id,name,code,status,metadata')
      .single();

    if (error || !data) {
      if (error?.code === '23505') {
        team = await loadTeam({
          supabase: input.supabase,
          organizationId,
          departmentId: department.id,
          code: teamCode,
        });
      }
      if (
        !team ||
        team.name !== teamName ||
        team.status !== 'ACTIVE' ||
        !sameMetadata(team.metadata)
      ) {
        throw new ControlPlaneBootstrapError('DATABASE', 'Team creation failed');
      }
    } else {
      team = data as TeamRow;
      teamCreated = true;
    }
  }

  return {
    branch: { row: branch, created: branchCreated },
    department: { row: department, created: departmentCreated },
    team: { row: team, created: teamCreated },
  };
}