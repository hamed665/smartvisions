'use client';

import { useMemo, useState } from 'react';
import {
  createAutomationRule,
  publishAutomationRule,
  saveAutomationRuleDraft,
  setAutomationRuleEnabled,
} from '@/app/management-actions';

type JsonRecord = Record<string, unknown>;

type TriggerContract = {
  trigger_key: string;
  family: string;
  source_kind: string;
  event_name: string;
  availability: string;
  description: string;
};

type ConditionFact = {
  fact_key: string;
  subject_type: string;
  data_type: string;
  operators: string[];
  nullable: boolean;
  description: string;
};

type ActionContract = {
  action_key: string;
  tool_key: string;
  scope_type: string;
  cost_class: string;
  side_effect_class: string;
  approval_requirement: string;
  availability: string;
  description: string;
};

type AutomationRule = {
  id: string;
  name: string;
  owner_user_id: string | null;
  trigger_key: string;
  action_key: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
  priority: number;
  config: unknown;
  publication_state: string;
  draft_revision: number;
  published_revision: number;
  latest_published_version: number;
  execution_state: string;
  last_published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AutomationVersion = {
  id: string;
  automation_rule_id: string;
  version: number;
  draft_revision: number;
  name: string;
  trigger_key: string;
  conditions: unknown;
  actions: unknown;
  priority: number;
  config: unknown;
  published_at: string;
};

type AutomationRun = {
  id: string;
  automation_rule_id: string;
  rule_version: number;
  trigger_key: string;
  source_event_key: string;
  subject_type: string | null;
  subject_id: string | null;
  status: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_error: string | null;
  compensation_state: string;
  created_at: string;
};

type AutomationRunAction = {
  id: string;
  automation_run_id: string;
  action_index: number;
  action_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  last_error: string | null;
  compensation_status: string;
  created_at: string;
  updated_at: string;
};

type VisualCondition = {
  id: string;
  fact: string;
  operator: string;
  value: string;
  value2: string;
};

type VisualAction = {
  id: string;
  key: string;
  config: JsonRecord;
};

type TestResult = {
  ok: boolean;
  error?: string;
  triggerSubject?: string | null;
  conditionSubject?: string | null;
  conditionLeaves?: number;
  actionCount?: number;
  sample?: { matched: boolean; leafCount: number } | null;
};

type Template = {
  id: string;
  name: string;
  description: string;
  triggerKey: string;
  conditions: VisualCondition[];
  actions: VisualAction[];
  config?: JsonRecord;
};

const SUBJECT_BY_FAMILY: Record<string, string | null> = {
  MESSAGE: 'CONVERSATION',
  CUSTOMER: 'ACCOUNT',
  LEAD: 'LEAD',
  DEAL: 'DEAL',
  TASK: 'TASK',
  SEGMENT: 'SEGMENT_SNAPSHOT',
  CASE: 'CASE',
  BOOKING: 'BOOKING',
  SCHEDULE: null,
  PROVIDER_WEBHOOK: null,
};

const TEMPLATE_DEFINITIONS: Template[] = [
  {
    id: 'hot-lead-preview',
    name: 'Hot lead → Generate preview',
    description: 'When a governed Lead becomes HOT, generate or reuse a production preview.',
    triggerKey: 'HOT_LEAD',
    conditions: [],
    actions: [{ id: 't1-a1', key: 'GENERATE_PREVIEW', config: { explicitRequest: true } }],
  },
  {
    id: 'positive-reply-preview',
    name: 'Positive reply → Generate preview',
    description: 'Generate a preview when canonical reply evidence is classified as positive.',
    triggerKey: 'POSITIVE_REPLY',
    conditions: [],
    actions: [{ id: 't2-a1', key: 'GENERATE_PREVIEW', config: { explicitRequest: true } }],
  },
  {
    id: 'message-human-handoff',
    name: 'Inbound message → Human handoff',
    description: 'Move a conversation to governed human handling with durable handoff evidence.',
    triggerKey: 'MESSAGE_RECEIVED',
    conditions: [],
    actions: [{ id: 't3-a1', key: 'HANDOFF_HUMAN', config: { reasons: ['AUTOMATION_RULE'] } }],
  },
  {
    id: 'message-operator-brief',
    name: 'Inbound message → Operator brief',
    description: 'Create an internal operator brief without contacting the customer.',
    triggerKey: 'MESSAGE_RECEIVED',
    conditions: [],
    actions: [{
      id: 't4-a1',
      key: 'CREATE_OPERATOR_BRIEF',
      config: {
        briefType: 'INBOUND',
        title: 'Automation review',
        summary: 'Review this inbound conversation.',
        requiresAction: true,
      },
    }],
  },
  {
    id: 'daily-executive-report',
    name: 'Daily executive report',
    description: 'Deliver a governed multilingual executive report every day through the canonical reporting scheduler.',
    triggerKey: 'SCHEDULE_DUE',
    conditions: [],
    config: {
      reportSchedule: {
        cadence: 'DAILY',
        timezone: 'Asia/Muscat',
        time: '08:00',
      },
    },
    actions: [{
      id: 't5-a1',
      key: 'DELIVER_DATA_EXPORT',
      config: {
        format: 'PDF',
        days: 30,
        language: 'AUTO',
        summaryMode: 'EXECUTIVE',
        includeAnomalies: true,
      },
    }],
  },
];

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

function asActions(value: unknown): VisualAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    const row = asRecord(item);
    const key = typeof row.key === 'string' ? row.key : '';
    if (!key) return [];
    return [{
      id: `existing-action-${index}`,
      key,
      config: asRecord(row.config),
    }];
  });
}

function asVisualConditions(value: unknown): {
  supported: boolean;
  groupOp: 'AND' | 'OR';
  conditions: VisualCondition[];
} {
  if (!Array.isArray(value) || value.length === 0) {
    return { supported: true, groupOp: 'AND', conditions: [] };
  }

  let nodes: unknown[] = value;
  let groupOp: 'AND' | 'OR' = 'AND';
  if (value.length === 1) {
    const first = asRecord(value[0]);
    if (first.kind === 'GROUP' && (first.op === 'AND' || first.op === 'OR') && Array.isArray(first.children)) {
      nodes = first.children;
      groupOp = first.op;
    }
  }

  const conditions: VisualCondition[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const row = asRecord(nodes[index]);
    if (row.kind !== 'PREDICATE' || typeof row.fact !== 'string' || typeof row.operator !== 'string') {
      return { supported: false, groupOp: 'AND', conditions: [] };
    }
    const rawValue = row.value;
    conditions.push({
      id: `existing-condition-${index}`,
      fact: row.fact,
      operator: row.operator,
      value: Array.isArray(rawValue) ? String(rawValue[0] ?? '') : rawValue == null ? '' : String(rawValue),
      value2: Array.isArray(rawValue) ? String(rawValue[1] ?? '') : '',
    });
  }
  return { supported: true, groupOp, conditions };
}

function typedScalar(raw: string, dataType: string) {
  if (dataType === 'NUMBER') {
    const value = Number(raw);
    return Number.isFinite(value) ? value : raw;
  }
  if (dataType === 'BOOLEAN') return raw === 'true';
  if (dataType === 'TIMESTAMP' && raw) {
    const value = new Date(raw);
    return Number.isNaN(value.getTime()) ? raw : value.toISOString();
  }
  return raw;
}

function buildPredicate(row: VisualCondition, facts: ConditionFact[]) {
  const fact = facts.find(item => item.fact_key === row.fact);
  if (!fact) return { kind: 'PREDICATE', fact: row.fact, operator: row.operator, value: row.value };

  const base: JsonRecord = { kind: 'PREDICATE', fact: row.fact, operator: row.operator };
  if (row.operator === 'IS_SET' || row.operator === 'IS_NOT_SET') return base;
  if (row.operator === 'IN' || row.operator === 'NOT_IN') {
    return {
      ...base,
      value: row.value.split(',').map(value => value.trim()).filter(Boolean).map(value => typedScalar(value, fact.data_type)),
    };
  }
  if (row.operator === 'BETWEEN') {
    return {
      ...base,
      value: [typedScalar(row.value, fact.data_type), typedScalar(row.value2, fact.data_type)],
    };
  }
  return { ...base, value: typedScalar(row.value, fact.data_type) };
}

function buildConditions(rows: VisualCondition[], groupOp: 'AND' | 'OR', facts: ConditionFact[]) {
  const predicates = rows.map(row => buildPredicate(row, facts));
  if (predicates.length <= 1) return predicates;
  return [{ kind: 'GROUP', op: groupOp, children: predicates }];
}

function serializeActions(rows: VisualAction[]) {
  return rows.map(row => ({ key: row.key, config: row.config }));
}

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function statusClass(status: string) {
  return ['FAILED', 'DEAD_LETTER', 'CANCELLED'].includes(status) ? 'status dangerStatus' : 'status';
}

function defaultActionConfig(actionKey: string): JsonRecord {
  if (actionKey === 'DELIVER_DATA_EXPORT') {
    return {
      format: 'PDF',
      days: 30,
      language: 'AUTO',
      summaryMode: 'EXECUTIVE',
      includeAnomalies: true,
    };
  }
  return {};
}

function actionConfigField(
  action: VisualAction,
  updateConfig: (next: JsonRecord) => void,
) {
  const config = action.config;
  if (action.key === 'GENERATE_PREVIEW') {
    return <div className="automationActionConfig">
      <label className="toggleLabel">
        <input
          type="checkbox"
          checked={config.explicitRequest === true}
          onChange={event => updateConfig({ ...config, explicitRequest: event.target.checked })}
        />
        Explicit preview request
      </label>
      <label className="toggleLabel">
        <input
          type="checkbox"
          checked={config.ownerApprovedHeavyGeneration === true}
          onChange={event => updateConfig({ ...config, ownerApprovedHeavyGeneration: event.target.checked })}
        />
        Owner-approved heavy generation
      </label>
      <label>Site language
        <input
          value={String(config.siteLanguage ?? '')}
          onChange={event => updateConfig({ ...config, siteLanguage: event.target.value })}
          placeholder="en"
        />
      </label>
    </div>;
  }

  if (action.key === 'HANDOFF_HUMAN') {
    const reasons = Array.isArray(config.reasons) ? config.reasons.join(', ') : '';
    return <div className="automationActionConfig">
      <label>Handoff reasons
        <input
          value={reasons}
          onChange={event => updateConfig({
            ...config,
            reasons: event.target.value.split(',').map(value => value.trim()).filter(Boolean),
          })}
          placeholder="CUSTOMER_REQUEST, HIGH_RISK"
        />
      </label>
    </div>;
  }

  if (action.key === 'CREATE_OPERATOR_BRIEF') {
    return <div className="automationActionConfig automationActionConfigWide">
      <label>Brief type
        <select
          value={String(config.briefType ?? 'INBOUND')}
          onChange={event => updateConfig({ ...config, briefType: event.target.value })}
        >
          {['INBOUND', 'OUTBOUND_PREVIEW', 'HOT_LEAD', 'HANDOFF', 'DAILY_REPORT'].map(value =>
            <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>Title
        <input
          value={String(config.title ?? '')}
          onChange={event => updateConfig({ ...config, title: event.target.value })}
          placeholder="Operator review"
        />
      </label>
      <label className="wideField">Summary
        <textarea
          rows={3}
          value={String(config.summary ?? '')}
          onChange={event => updateConfig({ ...config, summary: event.target.value })}
          placeholder="What should the operator know?"
        />
      </label>
      <label className="toggleLabel">
        <input
          type="checkbox"
          checked={config.requiresAction === true}
          onChange={event => updateConfig({ ...config, requiresAction: event.target.checked })}
        />
        Requires operator action
      </label>
    </div>;
  }

  if (action.key === 'MARK_HOT') {
    return <div className="automationActionConfig">
      <label>Minimum governed score
        <input
          type="number"
          min={50}
          max={100}
          value={String(config.minimumScore ?? 70)}
          onChange={event => updateConfig({ ...config, minimumScore: Number(event.target.value) })}
        />
      </label>
    </div>;
  }

  if (action.key === 'SEND_FOLLOWUP') {
    const sendContext = asRecord(config.sendContext);
    return <div className="automationActionConfig automationActionConfigWide">
      <label className="wideField">Message body
        <textarea
          rows={4}
          value={String(config.body ?? '')}
          onChange={event => updateConfig({ ...config, body: event.target.value })}
          placeholder="Follow-up message that will still require governed approval."
        />
      </label>
      <label>Destination
        <input
          value={String(sendContext.to ?? '')}
          onChange={event => updateConfig({ ...config, sendContext: { ...sendContext, to: event.target.value } })}
          placeholder="+968..."
        />
      </label>
      <label>Market code
        <input
          value={String(sendContext.market_code ?? '')}
          onChange={event => updateConfig({ ...config, sendContext: { ...sendContext, market_code: event.target.value.toUpperCase() } })}
          placeholder="OM"
        />
      </label>
      <label>Email subject (when channel is EMAIL)
        <input
          value={String(sendContext.subject ?? '')}
          onChange={event => updateConfig({ ...config, sendContext: { ...sendContext, subject: event.target.value } })}
        />
      </label>
      <label>Mailbox ID (when channel is EMAIL)
        <input
          value={String(sendContext.mailbox_id ?? '')}
          onChange={event => updateConfig({ ...config, sendContext: { ...sendContext, mailbox_id: event.target.value } })}
        />
      </label>
    </div>;
  }

  if (action.key === 'DELIVER_DATA_EXPORT') {
    return <div className="automationActionConfig automationActionConfigWide">
      <label>Attachment format
        <select
          value={String(config.format ?? 'PDF')}
          onChange={event => updateConfig({ ...config, format: event.target.value })}
        >
          {['PDF', 'XLSX', 'CSV', 'JSON'].map(value => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label>Reporting window
        <select
          value={String(config.days ?? 30)}
          onChange={event => updateConfig({ ...config, days: Number(event.target.value) })}
        >
          {[7, 30, 90].map(value => <option key={value} value={value}>{value} days</option>)}
        </select>
      </label>
      <label>Summary language
        <select
          value={String(config.language ?? 'AUTO')}
          onChange={event => updateConfig({ ...config, language: event.target.value })}
        >
          <option value="AUTO">Auto · Organization language</option>
          <option value="EN">English</option>
          <option value="AR">Arabic</option>
          <option value="FA">Persian</option>
        </select>
      </label>
      <label>Summary mode
        <select
          value={String(config.summaryMode ?? 'EXECUTIVE')}
          onChange={event => updateConfig({ ...config, summaryMode: event.target.value })}
        >
          <option value="EXECUTIVE">Executive briefing</option>
          <option value="STANDARD">Standard summary</option>
        </select>
      </label>
      <label className="toggleLabel">
        <input
          type="checkbox"
          checked={config.includeAnomalies !== false}
          onChange={event => updateConfig({ ...config, includeAnomalies: event.target.checked })}
        />
        Include governed anomaly alerts
      </label>
    </div>;
  }

  return <p className="muted smallText">This action has no business-facing configuration.</p>;
}

function RuleEditor(props: {
  mode: 'create' | 'edit';
  editable: boolean;
  rule?: AutomationRule;
  triggers: TriggerContract[];
  facts: ConditionFact[];
  actions: ActionContract[];
}) {
  const { mode, editable, rule, triggers, facts, actions } = props;
  const parsedConditions = asVisualConditions(rule?.conditions ?? []);
  const [name, setName] = useState(rule?.name ?? '');
  const [triggerKey, setTriggerKey] = useState(rule?.trigger_key ?? triggers.find(item => item.availability === 'AVAILABLE')?.trigger_key ?? '');
  const [priority, setPriority] = useState(rule?.priority ?? 50);
  const [groupOp, setGroupOp] = useState<'AND' | 'OR'>(parsedConditions.groupOp);
  const [conditions, setConditions] = useState<VisualCondition[]>(parsedConditions.conditions);
  const [preserveAdvancedConditions, setPreserveAdvancedConditions] = useState(!parsedConditions.supported);
  const [ruleConfig, setRuleConfig] = useState<JsonRecord>(() => asRecord(rule?.config ?? {}));
  const [actionRows, setActionRows] = useState<VisualAction[]>(() => {
    const existing = asActions(rule?.actions ?? []);
    if (existing.length) return existing;
    const first = actions.find(item => item.availability === 'AVAILABLE');
    return first ? [{ id: 'new-action-0', key: first.action_key, config: defaultActionConfig(first.action_key) }] : [];
  });
  const [testSubjectId, setTestSubjectId] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const trigger = triggers.find(item => item.trigger_key === triggerKey);
  const triggerSubject = trigger ? SUBJECT_BY_FAMILY[trigger.family] ?? null : null;
  const visibleFacts = triggerSubject ? facts.filter(fact => fact.subject_type === triggerSubject) : [];
  const compatibleActions = actions.filter(action =>
    action.availability === 'AVAILABLE'
    && (
      action.scope_type === 'AUTOMATION_RULE'
      || triggerSubject === null
      || action.scope_type === triggerSubject
    )
  );
  const effectiveConditions = preserveAdvancedConditions
    ? (rule?.conditions ?? [])
    : buildConditions(conditions, groupOp, facts);
  const effectiveActions = serializeActions(actionRows);

  const applyTemplate = (template: Template) => {
    setName(template.name);
    setTriggerKey(template.triggerKey);
    setConditions(template.conditions.map((row, index) => ({ ...row, id: `${template.id}-condition-${index}` })));
    setActionRows(template.actions.map((row, index) => ({ ...row, id: `${template.id}-action-${index}` })));
    setRuleConfig(template.config ? { ...template.config } : {});
    setPreserveAdvancedConditions(false);
    setTestResult(null);
  };

  const addCondition = () => {
    const firstFact = visibleFacts[0];
    if (!firstFact) return;
    setConditions(current => [...current, {
      id: crypto.randomUUID(),
      fact: firstFact.fact_key,
      operator: firstFact.operators[0] ?? 'EQ',
      value: '',
      value2: '',
    }]);
  };

  const updateCondition = (id: string, patch: Partial<VisualCondition>) => {
    setConditions(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const addAction = () => {
    const first = compatibleActions[0];
    if (!first || actionRows.length >= 20) return;
    setActionRows(current => [...current, { id: crypto.randomUUID(), key: first.action_key, config: defaultActionConfig(first.action_key) }]);
  };

  const updateAction = (id: string, patch: Partial<VisualAction>) => {
    setActionRows(current => current.map(row => row.id === id ? { ...row, ...patch } : row));
  };

  const moveAction = (index: number, offset: number) => {
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= actionRows.length) return;
    setActionRows(current => {
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const testDefinition = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          triggerKey,
          conditions: effectiveConditions,
          actions: effectiveActions,
          config: ruleConfig,
          subjectId: testSubjectId.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({ ok: false, error: 'Test response was not JSON' }));
      setTestResult(body as TestResult);
    } catch (error) {
      setTestResult({ ok: false, error: error instanceof Error ? error.message : 'Test mode failed' });
    } finally {
      setTesting(false);
    }
  };

  if (!editable) return null;

  const formAction = mode === 'create' ? createAutomationRule : saveAutomationRuleDraft;
  const availableTemplates = TEMPLATE_DEFINITIONS.filter(template =>
    triggers.some(item => item.trigger_key === template.triggerKey && item.availability === 'AVAILABLE')
    && template.actions.every(action => actions.some(item => item.action_key === action.key && item.availability === 'AVAILABLE')),
  );

  return <div className="automationBuilder">
    {mode === 'create' ? <div className="automationTemplateRail">
      {availableTemplates.map(template =>
        <button type="button" key={template.id} onClick={() => applyTemplate(template)}>
          <strong>{template.name}</strong>
          <span>{template.description}</span>
        </button>)}
    </div> : null}

    <form action={formAction} className="automationBuilderForm">
      {rule ? <>
        <input type="hidden" name="id" value={rule.id} />
        <input type="hidden" name="draft_revision" value={rule.draft_revision} />
        <input type="hidden" name="owner_user_id" value={rule.owner_user_id ?? ''} />
      </> : null}
      <input type="hidden" name="action_key" value={actionRows[0]?.key ?? ''} />
      <input type="hidden" name="conditions_json" value={JSON.stringify(effectiveConditions)} />
      <input type="hidden" name="actions_json" value={JSON.stringify(effectiveActions)} />
      <input type="hidden" name="config_json" value={JSON.stringify(ruleConfig)} />

      <div className="automationBuilderGrid">
        <label>Workflow name
          <input name="name" required maxLength={160} value={name} onChange={event => setName(event.target.value)} />
        </label>
        <label>Trigger
          <select name="trigger_key" value={triggerKey} onChange={event => {
            const nextTrigger = event.target.value;
            setTriggerKey(nextTrigger);
            setConditions([]);
            setPreserveAdvancedConditions(false);
            if (nextTrigger === 'SCHEDULE_DUE') {
              setRuleConfig(current => Object.keys(asRecord(current.reportSchedule)).length
                ? current
                : {
                    ...current,
                    reportSchedule: { cadence: 'DAILY', timezone: 'Asia/Muscat', time: '08:00' },
                  });
            }
            setTestResult(null);
          }}>
            {triggers.map(item =>
              <option key={item.trigger_key} value={item.trigger_key}>
                {item.trigger_key} · {item.family} · {item.availability}
              </option>)}
          </select>
        </label>
        <label>Priority
          <input type="number" name="priority" min={0} max={100} value={priority} onChange={event => setPriority(Number(event.target.value))} />
        </label>
      </div>

      {triggerKey === 'SCHEDULE_DUE' ? (() => {
        const schedule = asRecord(ruleConfig.reportSchedule);
        const cadence = String(schedule.cadence ?? 'DAILY').toUpperCase();
        const updateSchedule = (patch: JsonRecord) => setRuleConfig(current => ({
          ...current,
          reportSchedule: { ...asRecord(current.reportSchedule), ...patch },
        }));
        const customWeekdays = Array.isArray(schedule.weekdays)
          ? schedule.weekdays.map(Number).filter(value => Number.isInteger(value) && value >= 1 && value <= 7)
          : [1, 2, 3, 4, 5];
        return <section className="automationActionConfig automationActionConfigWide">
          <label>Report cadence
            <select
              value={cadence}
              onChange={event => {
                const next = event.target.value;
                const base: JsonRecord = { cadence: next, timezone: String(schedule.timezone ?? 'Asia/Muscat'), time: String(schedule.time ?? '08:00') };
                if (next === 'WEEKLY') base.weekday = Number(schedule.weekday ?? 1);
                if (next === 'MONTHLY') base.dayOfMonth = Number(schedule.dayOfMonth ?? 1);
                if (next === 'CUSTOM') base.weekdays = customWeekdays;
                setRuleConfig(current => ({ ...current, reportSchedule: base }));
              }}
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom weekdays</option>
            </select>
          </label>
          <label>Timezone
            <input
              value={String(schedule.timezone ?? 'Asia/Muscat')}
              onChange={event => updateSchedule({ timezone: event.target.value })}
              placeholder="Asia/Muscat"
            />
          </label>
          <label>Delivery time
            <input
              type="time"
              value={String(schedule.time ?? '08:00')}
              onChange={event => updateSchedule({ time: event.target.value })}
            />
          </label>
          {cadence === 'WEEKLY' ? <label>Weekday
            <select value={String(schedule.weekday ?? 1)} onChange={event => updateSchedule({ weekday: Number(event.target.value) })}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label, index) =>
                <option key={label} value={index + 1}>{label}</option>)}
            </select>
          </label> : null}
          {cadence === 'MONTHLY' ? <label>Day of month
            <input
              type="number"
              min={1}
              max={28}
              value={String(schedule.dayOfMonth ?? 1)}
              onChange={event => updateSchedule({ dayOfMonth: Number(event.target.value) })}
            />
          </label> : null}
          {cadence === 'CUSTOM' ? <fieldset className="wideField">
            <legend>Run on weekdays</legend>
            <div className="conversationFilters">
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((label, index) => {
                const value = index + 1;
                return <label className="toggleLabel" key={label}>
                  <input
                    type="checkbox"
                    checked={customWeekdays.includes(value)}
                    onChange={event => updateSchedule({
                      weekdays: event.target.checked
                        ? [...new Set([...customWeekdays, value])].sort((a, b) => a - b)
                        : customWeekdays.filter(day => day !== value),
                    })}
                  />
                  {label}
                </label>;
              })}
            </div>
          </fieldset> : null}
          <p className="muted smallText wideField">
            Cloudflare Cron remains the scheduler. This rule only declares the governed local cadence consumed by DATA-REPORTING.
          </p>
        </section>;
      })() : null}

      <div className="automationFlow">
        <div className="automationNode automationNodeTrigger">
          <span className="automationNodeIndex">1</span>
          <div>
            <strong>When</strong>
            <b>{triggerKey || 'Choose a trigger'}</b>
            <p>{trigger?.description ?? 'Select a canonical trigger contract.'}</p>
          </div>
        </div>

        <div className="automationConnector">↓</div>

        <div className="automationNode">
          <span className="automationNodeIndex">2</span>
          <div className="automationNodeBody">
            <div className="automationNodeHeader">
              <div>
                <strong>Only if</strong>
                <b>{preserveAdvancedConditions ? 'Advanced condition graph preserved' : conditions.length ? `${conditions.length} condition(s)` : 'No conditions'}</b>
              </div>
              {!preserveAdvancedConditions && visibleFacts.length ? <button type="button" onClick={addCondition}>+ Condition</button> : null}
            </div>

            {preserveAdvancedConditions ? <div className="automationAdvancedNotice">
              <p>This workflow contains nested/advanced condition JSON. It is preserved exactly so the visual editor cannot silently flatten it.</p>
              <button type="button" onClick={() => {
                setConditions([]);
                setPreserveAdvancedConditions(false);
              }}>Replace with visual conditions</button>
            </div> : <>
              {conditions.length > 1 ? <label className="automationGroupOperator">Match
                <select value={groupOp} onChange={event => setGroupOp(event.target.value as 'AND' | 'OR')}>
                  <option value="AND">ALL conditions (AND)</option>
                  <option value="OR">ANY condition (OR)</option>
                </select>
              </label> : null}
              <div className="automationConditionList">
                {conditions.map(row => {
                  const fact = facts.find(item => item.fact_key === row.fact);
                  const operators = fact?.operators ?? [];
                  const needsValue = !['IS_SET', 'IS_NOT_SET'].includes(row.operator);
                  const needsSecond = row.operator === 'BETWEEN';
                  return <div className="automationConditionRow" key={row.id}>
                    <select value={row.fact} onChange={event => {
                      const nextFact = facts.find(item => item.fact_key === event.target.value);
                      updateCondition(row.id, {
                        fact: event.target.value,
                        operator: nextFact?.operators[0] ?? 'EQ',
                        value: '',
                        value2: '',
                      });
                    }}>
                      {visibleFacts.map(item =>
                        <option key={item.fact_key} value={item.fact_key}>{item.fact_key}</option>)}
                    </select>
                    <select value={row.operator} onChange={event => updateCondition(row.id, { operator: event.target.value })}>
                      {operators.map(operator => <option key={operator} value={operator}>{operator}</option>)}
                    </select>
                    {needsValue ? fact?.data_type === 'BOOLEAN'
                      ? <select value={row.value} onChange={event => updateCondition(row.id, { value: event.target.value })}>
                          <option value="">Select</option><option value="true">True</option><option value="false">False</option>
                        </select>
                      : <input
                          type={fact?.data_type === 'NUMBER' ? 'number' : fact?.data_type === 'TIMESTAMP' ? 'datetime-local' : 'text'}
                          value={row.value}
                          onChange={event => updateCondition(row.id, { value: event.target.value })}
                          placeholder={row.operator === 'IN' || row.operator === 'NOT_IN' ? 'Comma-separated values' : fact?.data_type ?? 'Value'}
                        />
                      : <span className="muted smallText">No value required</span>}
                    {needsSecond ? <input
                      type={fact?.data_type === 'NUMBER' ? 'number' : fact?.data_type === 'TIMESTAMP' ? 'datetime-local' : 'text'}
                      value={row.value2}
                      onChange={event => updateCondition(row.id, { value2: event.target.value })}
                      placeholder="Upper bound"
                    /> : null}
                    <button type="button" className="automationDangerButton" onClick={() => setConditions(current => current.filter(item => item.id !== row.id))}>Remove</button>
                  </div>;
                })}
                {!conditions.length ? <p className="muted smallText">
                  This workflow will run for every matching trigger event. {triggerSubject ? `Condition facts are available for ${triggerSubject}.` : 'This trigger has no fixed condition subject.'}
                </p> : null}
              </div>
            </>}
          </div>
        </div>

        <div className="automationConnector">↓</div>

        <div className="automationNode automationNodeAction">
          <span className="automationNodeIndex">3</span>
          <div className="automationNodeBody">
            <div className="automationNodeHeader">
              <div><strong>Then</strong><b>{actionRows.length} ordered action(s)</b></div>
              <button type="button" onClick={addAction} disabled={actionRows.length >= 20 || compatibleActions.length === 0}>+ Action</button>
            </div>
            <div className="automationActionList">
              {actionRows.map((row, index) => {
                const contract = actions.find(item => item.action_key === row.key);
                return <div className="automationActionCard" key={row.id}>
                  <div className="automationActionHeader">
                    <span className="automationActionOrder">{index + 1}</span>
                    <select value={row.key} onChange={event => updateAction(row.id, { key: event.target.value, config: defaultActionConfig(event.target.value) })}>
                      {(compatibleActions.some(item => item.action_key === row.key)
                        ? compatibleActions
                        : [
                            ...compatibleActions,
                            ...actions.filter(item => item.action_key === row.key),
                          ]
                      ).map(item =>
                        <option key={item.action_key} value={item.action_key}>
                          {item.action_key} · {item.scope_type}{compatibleActions.some(allowed => allowed.action_key === item.action_key) ? '' : ' · incompatible'}
                        </option>)}
                    </select>
                    <div className="automationActionButtons">
                      <button type="button" onClick={() => moveAction(index, -1)} disabled={index === 0}>↑</button>
                      <button type="button" onClick={() => moveAction(index, 1)} disabled={index === actionRows.length - 1}>↓</button>
                      <button type="button" className="automationDangerButton" onClick={() => setActionRows(current => current.filter(item => item.id !== row.id))} disabled={actionRows.length <= 1}>Remove</button>
                    </div>
                  </div>
                  <p className="muted smallText">
                    {contract?.description ?? 'Unknown action'} · approval {contract?.approval_requirement ?? 'UNKNOWN'} · {contract?.side_effect_class ?? 'UNKNOWN'}
                  </p>
                  {actionConfigField(row, next => updateAction(row.id, { config: next }))}
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="automationTestPanel">
        <div>
          <strong>Test mode</strong>
          <p className="muted smallText">Runs canonical validators and optionally evaluates conditions against one real Organization-scoped record. It never creates a run or executes an action.</p>
        </div>
        <label>Optional test {triggerSubject ?? 'subject'} UUID
          <input value={testSubjectId} onChange={event => setTestSubjectId(event.target.value)} placeholder="UUID for read-only condition evaluation" />
        </label>
        <button type="button" onClick={testDefinition} disabled={testing}>{testing ? 'Testing…' : 'Test definition'}</button>
        {testResult ? <div className={testResult.ok ? 'automationTestResult automationTestOk' : 'automationTestResult automationTestError'}>
          <strong>{testResult.ok ? 'Definition valid' : 'Definition blocked'}</strong>
          {testResult.error ? <span>{testResult.error}</span> : null}
          {testResult.ok ? <span>
            {testResult.conditionLeaves ?? 0} condition leaves · {testResult.actionCount ?? 0} actions
            {testResult.triggerSubject ? ` · subject ${testResult.triggerSubject}` : ''}
            {testResult.sample ? ` · sample matched: ${testResult.sample.matched ? 'YES' : 'NO'}` : ''}
          </span> : null}
        </div> : null}
      </div>

      <div className="automationBuilderSubmit">
        <button>{mode === 'create' ? 'Create disabled draft' : 'Save draft revision'}</button>
        <span className="muted smallText">Saving never publishes or enables automatically.</span>
      </div>
    </form>
  </div>;
}

function RuleHistory(props: {
  versions: AutomationVersion[];
  runs: AutomationRun[];
  runActions: AutomationRunAction[];
}) {
  const { versions, runs, runActions } = props;
  const diagnostics = runActions.filter(action => action.last_error || ['FAILED', 'DEAD_LETTER'].includes(action.status));

  return <div className="automationHistoryGrid">
    <details>
      <summary>Version comparison · {versions.length} published</summary>
      <div className="automationVersionList">
        {versions.length ? versions.map((version, index) => {
          const previous = versions[index + 1];
          const changes = previous ? [
            previous.trigger_key !== version.trigger_key ? 'trigger' : null,
            JSON.stringify(previous.conditions) !== JSON.stringify(version.conditions) ? 'conditions' : null,
            JSON.stringify(previous.actions) !== JSON.stringify(version.actions) ? 'actions' : null,
            previous.priority !== version.priority ? 'priority' : null,
            JSON.stringify(previous.config) !== JSON.stringify(version.config) ? 'config' : null,
          ].filter(Boolean) : ['first published version'];

          return <div className="automationVersionCard" key={version.id}>
            <div className="headerRow">
              <strong>v{version.version} · draft r{version.draft_revision}</strong>
              <span className="muted smallText">{formatDate(version.published_at)}</span>
            </div>
            <p className="muted smallText">Changed: {changes.join(', ')}</p>
            <details>
              <summary>Inspect snapshot</summary>
              <pre className="auditJson">{JSON.stringify({
                trigger: version.trigger_key,
                conditions: version.conditions,
                actions: version.actions,
                priority: version.priority,
                config: version.config,
              }, null, 2)}</pre>
            </details>
          </div>;
        }) : <p className="muted smallText">No published version yet.</p>}
      </div>
    </details>

    <details>
      <summary>Execution history · {runs.length} recent run(s)</summary>
      <div className="automationRunList">
        {runs.length ? runs.map(run => {
          const actions = runActions.filter(action => action.automation_run_id === run.id);
          return <div className="automationRunCard" key={run.id}>
            <div className="headerRow">
              <div>
                <strong>{run.trigger_key} · v{run.rule_version}</strong>
                <span className="muted smallText">{formatDate(run.created_at)} · {run.subject_type ?? 'NO_SUBJECT'}</span>
              </div>
              <span className={statusClass(run.status)}>{run.status}</span>
            </div>
            {run.last_error ? <p className="automationErrorText">{run.last_error}</p> : null}
            <div className="automationRunActions">
              {actions.map(action =>
                <span key={action.id}>
                  #{action.action_index} {action.action_key} · {action.status} · attempt {action.attempt_count}/{action.max_attempts}
                </span>)}
            </div>
          </div>;
        }) : <p className="muted smallText">No runtime execution exists for this workflow.</p>}
      </div>
    </details>

    <details open={diagnostics.length > 0}>
      <summary>Error diagnostics · {diagnostics.length}</summary>
      <div className="automationDiagnostics">
        {diagnostics.length ? diagnostics.map(action =>
          <div key={action.id} className="automationDiagnosticCard">
            <strong>{action.action_key} · {action.status}</strong>
            <span>{action.last_error ?? 'No error text'}</span>
            <span className="muted smallText">Attempts {action.attempt_count}/{action.max_attempts} · compensation {action.compensation_status}</span>
          </div>) : <p className="muted smallText">No runtime errors recorded.</p>}
      </div>
    </details>
  </div>;
}

export function AutomationBuilder(props: {
  editable: boolean;
  rules: AutomationRule[];
  triggers: TriggerContract[];
  facts: ConditionFact[];
  actions: ActionContract[];
  versions: AutomationVersion[];
  runs: AutomationRun[];
  runActions: AutomationRunAction[];
}) {
  const { editable, rules, triggers, facts, actions, versions, runs, runActions } = props;
  const ready = rules.filter(rule => rule.execution_state === 'READY').length;
  const runCountByRule = useMemo(() => {
    const counts = new Map<string, number>();
    for (const run of runs) counts.set(run.automation_rule_id, (counts.get(run.automation_rule_id) ?? 0) + 1);
    return counts;
  }, [runs]);

  return <div>
    <div className="headerRow">
      <div>
        <h1>Automation Builder</h1>
        <p className="muted">Business-facing workflow design over canonical triggers, conditions, actions, immutable versions and durable runtime history.</p>
      </div>
      <span className="status">{ready} execution-ready</span>
    </div>

    <section className="panel automationBuilderBoundary">
      <div className="grid">
        <div><span className="muted smallText">Trigger contracts</span><strong>{triggers.filter(item => item.availability === 'AVAILABLE').length}/{triggers.length}</strong></div>
        <div><span className="muted smallText">Condition facts</span><strong>{facts.length}</strong></div>
        <div><span className="muted smallText">Action contracts</span><strong>{actions.filter(item => item.availability === 'AVAILABLE').length}/{actions.length}</strong></div>
        <div><span className="muted smallText">Recent runtime runs</span><strong>{runs.length}</strong></div>
      </div>
      <p className="muted smallText">The Builder stores nothing outside automation_rules and its immutable published versions. Runtime history is read-only here.</p>
    </section>

    <div className="settingsList">
      {rules.map(rule => {
        const ruleVersions = versions.filter(version => version.automation_rule_id === rule.id);
        const ruleRuns = runs.filter(run => run.automation_rule_id === rule.id);
        const relevantActionIds = new Set(ruleRuns.map(run => run.id));
        const ruleRunActions = runActions.filter(action => relevantActionIds.has(action.automation_run_id));
        const hasUnpublishedDraft = rule.publication_state !== 'PUBLISHED' || rule.published_revision !== rule.draft_revision;

        return <section className="panel" key={rule.id}>
          <div className="headerRow">
            <div>
              <h2>{rule.name}</h2>
              <p className="muted smallText">
                {rule.trigger_key} → {rule.action_key} · draft r{rule.draft_revision} · published v{rule.latest_published_version || 0} · {runCountByRule.get(rule.id) ?? 0} recent run(s)
              </p>
            </div>
            <span className={statusClass(rule.execution_state)}>{rule.execution_state}</span>
          </div>

          <RuleEditor
            mode="edit"
            editable={editable}
            rule={rule}
            triggers={triggers}
            facts={facts}
            actions={actions}
          />

          {editable ? <div className="approvalActions automationPublishBar">
            <form action={publishAutomationRule}>
              <input type="hidden" name="id" value={rule.id} />
              <input type="hidden" name="draft_revision" value={rule.draft_revision} />
              <button className="approveButton" disabled={!hasUnpublishedDraft}>Publish tested draft</button>
            </form>
            <form action={setAutomationRuleEnabled}>
              <input type="hidden" name="id" value={rule.id} />
              <input type="hidden" name="enabled" value={rule.enabled ? 'false' : 'true'} />
              <button disabled={!rule.enabled && rule.latest_published_version === 0}>
                {rule.enabled ? 'Disable published workflow' : 'Enable published workflow'}
              </button>
            </form>
          </div> : null}

          <RuleHistory versions={ruleVersions} runs={ruleRuns} runActions={ruleRunActions} />
        </section>;
      })}
    </div>

    {!rules.length ? <section className="panel">
      <p className="muted">No workflow exists in this Organization. Production remains unseeded until a real owner creates one.</p>
    </section> : null}

    {editable ? <section className="panel settingsCreate">
      <h2>Create workflow</h2>
      <p className="muted">Start from a governed template or build visually. Creation always produces a disabled draft.</p>
      <RuleEditor mode="create" editable triggers={triggers} facts={facts} actions={actions} />
    </section> : null}
  </div>;
}
