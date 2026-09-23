import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomFieldEntityType = 'LEAD' | 'DEAL';
export type CustomFieldDataType =
  | 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'BOOLEAN' | 'DATE' | 'DATETIME'
  | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'EMAIL' | 'PHONE' | 'URL' | 'CURRENCY';
export type CustomFieldSensitivity = 'INTERNAL' | 'PII' | 'SENSITIVE';
export type CustomFieldStatus = 'ACTIVE' | 'DEPRECATED';
export type CustomFieldValueState = 'SET' | 'CLEARED';

export type CustomFieldDefinitionRow = {
  id: string;
  organization_id: string;
  entity_type: CustomFieldEntityType;
  field_key: string;
  label: string;
  data_type: CustomFieldDataType;
  required: boolean;
  sensitivity_class: CustomFieldSensitivity;
  searchable: boolean;
  filterable: boolean;
  unique_value: boolean;
  text_min_length: number | null;
  text_max_length: number | null;
  number_min: number | null;
  number_max: number | null;
  default_text: string | null;
  default_number: number | null;
  default_boolean: boolean | null;
  default_date: string | null;
  default_datetime: string | null;
  default_currency_amount: number | null;
  default_currency_code: string | null;
  default_option_keys: string[] | null;
  status: CustomFieldStatus;
  version: number;
  last_request_key: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type CustomFieldOptionRow = {
  id: string;
  organization_id: string;
  definition_id: string;
  option_key: string;
  label: string;
  position: number;
  status: CustomFieldStatus;
  version: number;
  last_request_key: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type CustomFieldValueRow = {
  id: string;
  organization_id: string;
  definition_id: string;
  definition_version: number;
  entity_type: CustomFieldEntityType;
  data_type: CustomFieldDataType;
  lead_id: string | null;
  deal_id: string | null;
  state: CustomFieldValueState;
  value_text: string | null;
  value_number: number | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_currency_amount: number | null;
  value_currency_code: string | null;
  value_option_keys: string[] | null;
  version: number;
  last_request_key: string;
  created_by_user_id: string;
  updated_by_user_id: string;
  cleared_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  cleared_at: string | null;
};

export type TypedCustomFieldValue = {
  text?: string | null;
  number?: number | null;
  boolean?: boolean | null;
  date?: string | null;
  datetime?: string | null;
  currencyAmount?: number | null;
  currencyCode?: string | null;
  optionKeys?: string[] | null;
};

export class CustomFieldMutationError extends Error {
  code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'ALREADY_EXISTS';

  constructor(
    code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'ALREADY_EXISTS',
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function clampLimit(limit?: number) {
  if (!Number.isFinite(limit)) return 50;
  return Math.min(Math.max(Math.trunc(limit ?? 50), 1), 100);
}

function typedColumns(value: TypedCustomFieldValue | undefined) {
  return {
    value_text: value?.text ?? null,
    value_number: value?.number ?? null,
    value_boolean: value?.boolean ?? null,
    value_date: value?.date ?? null,
    value_datetime: value?.datetime ?? null,
    value_currency_amount: value?.currencyAmount ?? null,
    value_currency_code: value?.currencyCode ?? null,
    value_option_keys: value?.optionKeys ?? null,
  };
}

async function currentById<T>(
  supabase: SupabaseClient,
  table: string,
  organizationId: string,
  id: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`${table} lookup failed: ${error.message}`);
  return data as T | null;
}

export async function listCustomFieldDefinitions(input: {
  supabase: SupabaseClient;
  organizationId: string;
  entityType?: CustomFieldEntityType | null;
  includeDeprecated?: boolean;
  limit?: number;
  cursor?: { fieldKey: string; id: string } | null;
}) {
  const limit = clampLimit(input.limit);
  const { data, error } = await input.supabase.rpc('get_crm_custom_field_definitions', {
    p_organization_id: input.organizationId,
    p_entity_type: input.entityType ?? null,
    p_include_deprecated: input.includeDeprecated === true,
    p_limit: limit + 1,
    p_after_field_key: input.cursor?.fieldKey ?? null,
    p_after_id: input.cursor?.id ?? null,
  });
  if (error) throw new Error(`Custom-field definition query failed: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as CustomFieldDefinitionRow[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = hasMore ? items.at(-1) : null;
  return {
    items,
    nextCursor: last ? { fieldKey: last.field_key, id: last.id } : null,
  };
}

export async function createCustomFieldDefinition(input: {
  supabase: SupabaseClient;
  organizationId: string;
  actorUserId: string;
  entityType: CustomFieldEntityType;
  fieldKey: string;
  label: string;
  dataType: CustomFieldDataType;
  required?: boolean;
  sensitivityClass?: CustomFieldSensitivity;
  searchable?: boolean;
  filterable?: boolean;
  uniqueValue?: boolean;
  textMinLength?: number | null;
  textMaxLength?: number | null;
  numberMin?: number | null;
  numberMax?: number | null;
  defaultValue?: TypedCustomFieldValue;
  requestKey: string;
}) {
  const replay = await input.supabase
    .from('crm_custom_field_definitions')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('last_request_key', input.requestKey)
    .maybeSingle();
  if (replay.error) throw new Error(`Definition replay lookup failed: ${replay.error.message}`);
  if (replay.data) return replay.data as CustomFieldDefinitionRow;

  const value = input.defaultValue;
  const { data, error } = await input.supabase
    .from('crm_custom_field_definitions')
    .insert({
      organization_id: input.organizationId,
      entity_type: input.entityType,
      field_key: normalizeKey(input.fieldKey),
      label: input.label.trim(),
      data_type: input.dataType,
      required: input.required === true,
      sensitivity_class: input.sensitivityClass ?? 'INTERNAL',
      searchable: input.searchable === true,
      filterable: input.filterable !== false,
      unique_value: input.uniqueValue === true,
      text_min_length: input.textMinLength ?? null,
      text_max_length: input.textMaxLength ?? null,
      number_min: input.numberMin ?? null,
      number_max: input.numberMax ?? null,
      default_text: value?.text ?? null,
      default_number: value?.number ?? null,
      default_boolean: value?.boolean ?? null,
      default_date: value?.date ?? null,
      default_datetime: value?.datetime ?? null,
      default_currency_amount: value?.currencyAmount ?? null,
      default_currency_code: value?.currencyCode ?? null,
      default_option_keys: value?.optionKeys ?? null,
      last_request_key: input.requestKey.trim(),
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId,
    })
    .select('*')
    .single();

  if (!error && data) return data as CustomFieldDefinitionRow;

  if (error?.code === '23505') {
    const retry = await input.supabase
      .from('crm_custom_field_definitions')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('last_request_key', input.requestKey)
      .maybeSingle();
    if (!retry.error && retry.data) return retry.data as CustomFieldDefinitionRow;
  }

  throw new Error(`Custom-field definition create failed: ${error?.message ?? 'unknown error'}`);
}

export async function updateCustomFieldDefinition(input: {
  supabase: SupabaseClient;
  organizationId: string;
  definitionId: string;
  actorUserId: string;
  expectedVersion: number;
  requestKey: string;
  patch: Record<string, unknown>;
}) {
  const current = await currentById<CustomFieldDefinitionRow>(
    input.supabase,
    'crm_custom_field_definitions',
    input.organizationId,
    input.definitionId,
  );
  if (!current) throw new CustomFieldMutationError('NOT_FOUND', 'Custom-field definition not found');
  if (current.last_request_key === input.requestKey) return current;
  if (current.version !== input.expectedVersion) {
    throw new CustomFieldMutationError(
      'VERSION_CONFLICT',
      `Custom-field definition version conflict; current version is ${current.version}`,
    );
  }

  const update = {
    ...input.patch,
    last_request_key: input.requestKey.trim(),
    updated_by_user_id: input.actorUserId,
  };

  const { data, error } = await input.supabase
    .from('crm_custom_field_definitions')
    .update(update)
    .eq('organization_id', input.organizationId)
    .eq('id', input.definitionId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Custom-field definition update failed: ${error.message}`);
  if (data) return data as CustomFieldDefinitionRow;

  throw new CustomFieldMutationError('VERSION_CONFLICT', 'Custom-field definition changed concurrently');
}

export async function listCustomFieldOptions(input: {
  supabase: SupabaseClient;
  organizationId: string;
  definitionId: string;
  includeDeprecated?: boolean;
}) {
  let query = input.supabase
    .from('crm_custom_field_options')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('definition_id', input.definitionId)
    .order('position', { ascending: true })
    .order('id', { ascending: true });

  if (!input.includeDeprecated) query = query.eq('status', 'ACTIVE');
  const { data, error } = await query;
  if (error) throw new Error(`Custom-field option query failed: ${error.message}`);
  return (data ?? []) as CustomFieldOptionRow[];
}

export async function createCustomFieldOption(input: {
  supabase: SupabaseClient;
  organizationId: string;
  definitionId: string;
  actorUserId: string;
  optionKey: string;
  label: string;
  position: number;
  requestKey: string;
}) {
  const replay = await input.supabase
    .from('crm_custom_field_options')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('last_request_key', input.requestKey)
    .maybeSingle();
  if (replay.error) throw new Error(`Option replay lookup failed: ${replay.error.message}`);
  if (replay.data) return replay.data as CustomFieldOptionRow;

  const { data, error } = await input.supabase
    .from('crm_custom_field_options')
    .insert({
      organization_id: input.organizationId,
      definition_id: input.definitionId,
      option_key: normalizeKey(input.optionKey),
      label: input.label.trim(),
      position: input.position,
      last_request_key: input.requestKey.trim(),
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId,
    })
    .select('*')
    .single();

  if (!error && data) return data as CustomFieldOptionRow;

  if (error?.code === '23505') {
    const retry = await input.supabase
      .from('crm_custom_field_options')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('last_request_key', input.requestKey)
      .maybeSingle();

    if (!retry.error && retry.data) return retry.data as CustomFieldOptionRow;
  }

  throw new Error(`Custom-field option create failed: ${error?.message ?? 'unknown error'}`);
}

export async function updateCustomFieldOption(input: {
  supabase: SupabaseClient;
  organizationId: string;
  optionId: string;
  actorUserId: string;
  expectedVersion: number;
  requestKey: string;
  patch: Record<string, unknown>;
}) {
  const current = await currentById<CustomFieldOptionRow>(
    input.supabase,
    'crm_custom_field_options',
    input.organizationId,
    input.optionId,
  );
  if (!current) throw new CustomFieldMutationError('NOT_FOUND', 'Custom-field option not found');
  if (current.last_request_key === input.requestKey) return current;
  if (current.version !== input.expectedVersion) {
    throw new CustomFieldMutationError(
      'VERSION_CONFLICT',
      `Custom-field option version conflict; current version is ${current.version}`,
    );
  }

  const { data, error } = await input.supabase
    .from('crm_custom_field_options')
    .update({
      ...input.patch,
      last_request_key: input.requestKey.trim(),
      updated_by_user_id: input.actorUserId,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.optionId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Custom-field option update failed: ${error.message}`);
  if (data) return data as CustomFieldOptionRow;
  throw new CustomFieldMutationError('VERSION_CONFLICT', 'Custom-field option changed concurrently');
}

export async function listCustomFieldValues(input: {
  supabase: SupabaseClient;
  organizationId: string;
  entityType: CustomFieldEntityType;
  entityId: string;
  includeCleared?: boolean;
  limit?: number;
  cursor?: { definitionId: string; id: string } | null;
}) {
  const limit = clampLimit(input.limit);
  const { data, error } = await input.supabase.rpc('get_crm_custom_field_values', {
    p_organization_id: input.organizationId,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId,
    p_include_cleared: input.includeCleared === true,
    p_limit: limit + 1,
    p_after_definition_id: input.cursor?.definitionId ?? null,
    p_after_id: input.cursor?.id ?? null,
  });
  if (error) throw new Error(`Custom-field value query failed: ${error.message}`);

  const rows = (Array.isArray(data) ? data : []) as CustomFieldValueRow[];
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = hasMore ? items.at(-1) : null;
  return {
    items,
    nextCursor: last ? { definitionId: last.definition_id, id: last.id } : null,
  };
}

export async function createCustomFieldValue(input: {
  supabase: SupabaseClient;
  organizationId: string;
  definitionId: string;
  actorUserId: string;
  entityType: CustomFieldEntityType;
  entityId: string;
  value: TypedCustomFieldValue;
  requestKey: string;
}) {
  const replay = await input.supabase
    .from('crm_custom_field_values')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('last_request_key', input.requestKey)
    .maybeSingle();
  if (replay.error) throw new Error(`Value replay lookup failed: ${replay.error.message}`);
  if (replay.data) return replay.data as CustomFieldValueRow;

  let existing = input.supabase
    .from('crm_custom_field_values')
    .select('id,version')
    .eq('organization_id', input.organizationId)
    .eq('definition_id', input.definitionId);

  existing = input.entityType === 'LEAD'
    ? existing.eq('lead_id', input.entityId)
    : existing.eq('deal_id', input.entityId);

  const existingResult = await existing.maybeSingle();
  if (existingResult.error) {
    throw new Error(`Value existence lookup failed: ${existingResult.error.message}`);
  }
  if (existingResult.data) {
    throw new CustomFieldMutationError(
      'ALREADY_EXISTS',
      'Custom-field value already exists; update it with expectedVersion',
    );
  }

  const { data, error } = await input.supabase
    .from('crm_custom_field_values')
    .insert({
      organization_id: input.organizationId,
      definition_id: input.definitionId,
      definition_version: 1,
      entity_type: input.entityType,
      data_type: 'TEXT',
      lead_id: input.entityType === 'LEAD' ? input.entityId : null,
      deal_id: input.entityType === 'DEAL' ? input.entityId : null,
      state: 'SET',
      ...typedColumns(input.value),
      last_request_key: input.requestKey.trim(),
      created_by_user_id: input.actorUserId,
      updated_by_user_id: input.actorUserId,
    })
    .select('*')
    .single();

  if (!error && data) return data as CustomFieldValueRow;

  if (error?.code === '23505') {
    const retry = await input.supabase
      .from('crm_custom_field_values')
      .select('*')
      .eq('organization_id', input.organizationId)
      .eq('last_request_key', input.requestKey)
      .maybeSingle();

    if (!retry.error && retry.data) return retry.data as CustomFieldValueRow;
  }

  throw new Error(`Custom-field value create failed: ${error?.message ?? 'unknown error'}`);
}

export async function updateCustomFieldValue(input: {
  supabase: SupabaseClient;
  organizationId: string;
  valueId: string;
  actorUserId: string;
  expectedVersion: number;
  requestKey: string;
  state: CustomFieldValueState;
  value?: TypedCustomFieldValue;
}) {
  const current = await currentById<CustomFieldValueRow>(
    input.supabase,
    'crm_custom_field_values',
    input.organizationId,
    input.valueId,
  );
  if (!current) throw new CustomFieldMutationError('NOT_FOUND', 'Custom-field value not found');
  if (current.last_request_key === input.requestKey) return current;
  if (current.version !== input.expectedVersion) {
    throw new CustomFieldMutationError(
      'VERSION_CONFLICT',
      `Custom-field value version conflict; current version is ${current.version}`,
    );
  }

  const valueColumns = input.state === 'SET'
    ? typedColumns(input.value)
    : typedColumns(undefined);

  const { data, error } = await input.supabase
    .from('crm_custom_field_values')
    .update({
      state: input.state,
      ...valueColumns,
      last_request_key: input.requestKey.trim(),
      updated_by_user_id: input.actorUserId,
    })
    .eq('organization_id', input.organizationId)
    .eq('id', input.valueId)
    .eq('version', input.expectedVersion)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(`Custom-field value update failed: ${error.message}`);
  if (data) return data as CustomFieldValueRow;
  throw new CustomFieldMutationError('VERSION_CONFLICT', 'Custom-field value changed concurrently');
}

export async function exactFilterCustomField(input: {
  supabase: SupabaseClient;
  organizationId: string;
  definitionId: string;
  value: TypedCustomFieldValue;
  optionKey?: string | null;
  limit?: number;
  afterEntityId?: string | null;
}) {
  const { data, error } = await input.supabase.rpc('find_crm_entities_by_custom_field_exact', {
    p_organization_id: input.organizationId,
    p_definition_id: input.definitionId,
    p_value_text: input.value.text ?? null,
    p_value_number: input.value.number ?? null,
    p_value_boolean: input.value.boolean ?? null,
    p_value_date: input.value.date ?? null,
    p_value_datetime: input.value.datetime ?? null,
    p_value_currency_amount: input.value.currencyAmount ?? null,
    p_value_currency_code: input.value.currencyCode ?? null,
    p_option_key: input.optionKey ?? null,
    p_limit: clampLimit(input.limit),
    p_after_entity_id: input.afterEntityId ?? null,
  });

  if (error) throw new Error(`Custom-field exact filter failed: ${error.message}`);
  return data ?? [];
}
