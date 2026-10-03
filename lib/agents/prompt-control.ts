import type { ActivePromptSnapshot } from './contracts';
import { containsProviderSecretMaterial } from './quality-safety';

export type PromptRolloutMode = 'OFF' | 'SHADOW' | 'CANARY';
export type PromptEvaluationVerdict = 'PASS' | 'WARN' | 'BLOCK';

export type PromptEvaluation = {
  verdict: PromptEvaluationVerdict;
  checks: Array<{
    key: string;
    level: 'INFO' | 'WARN' | 'BLOCK';
    detail: string;
  }>;
};

export type PromptControlConfig = {
  mode: PromptRolloutMode;
  candidateVersion?: number;
  canaryPct: number;
};

type PromptVersion = {
  version: number;
  text: string;
};

function finiteInt(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function evaluatePromptCandidate(rawText: string): PromptEvaluation {
  const text = String(rawText ?? '').trim();
  const checks: PromptEvaluation['checks'] = [];

  if (!text) {
    checks.push({
      key: 'EMPTY',
      level: 'BLOCK',
      detail: 'Prompt candidate is empty.',
    });
  }
  if (text.length > 7_000) {
    checks.push({
      key: 'RUNTIME_TRUNCATION',
      level: 'BLOCK',
      detail: 'Prompt candidate exceeds the 7,000-character runtime boundary and would be truncated.',
    });
  }
  if (/\b(ignore|override|disregard)\b.{0,48}\b(previous|system|developer|policy|safety)\b/i.test(text)) {
    checks.push({
      key: 'CONTROL_CONFLICT',
      level: 'BLOCK',
      detail: 'Candidate contains an instruction that conflicts with higher-priority runtime controls.',
    });
  }
  if (containsProviderSecretMaterial(text)) {
    checks.push({
      key: 'SECRET_MATERIAL',
      level: 'BLOCK',
      detail: 'Prompt candidate contains provider-secret-like material and cannot be staged for runtime use.',
    });
  }
  if (/\b(guarantee|guaranteed|100%|always works|zero risk)\b/i.test(text)) {
    checks.push({
      key: 'OVERCLAIM_LANGUAGE',
      level: 'WARN',
      detail: 'Candidate contains absolute or guarantee language that deserves review.',
    });
  }

  if (!checks.length) {
    checks.push({
      key: 'BOUNDED',
      level: 'INFO',
      detail: 'Candidate is non-empty, within the runtime boundary and contains no obvious control-conflict pattern.',
    });
  }

  const verdict: PromptEvaluationVerdict = checks.some((check) => check.level === 'BLOCK')
    ? 'BLOCK'
    : checks.some((check) => check.level === 'WARN')
      ? 'WARN'
      : 'PASS';
  return { verdict, checks };
}

export function parsePromptControlConfig(config: unknown): PromptControlConfig {
  const root = record(config);
  const control = record(root.promptControl);
  const rawMode = String(control.mode ?? 'OFF').trim().toUpperCase();
  const mode: PromptRolloutMode =
    rawMode === 'SHADOW' || rawMode === 'CANARY' ? rawMode : 'OFF';
  const candidateVersion = finiteInt(control.candidateVersion);
  const canaryRaw = finiteInt(control.canaryPct);
  const canaryPct = mode === 'CANARY'
    ? Math.max(1, Math.min(canaryRaw ?? 10, 50))
    : 0;
  return {
    mode,
    ...(candidateVersion && candidateVersion > 0 ? { candidateVersion } : {}),
    canaryPct,
  };
}

export function stablePromptBucket(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function selectPromptForRuntime(input: {
  baseline?: PromptVersion;
  candidate?: PromptVersion;
  control: PromptControlConfig;
  rolloutKey: string;
}): ActivePromptSnapshot | undefined {
  const baseline = input.baseline;
  const candidate = input.candidate;
  const control = input.control;
  const candidateValid = Boolean(
    candidate &&
    control.candidateVersion === candidate.version &&
    evaluatePromptCandidate(candidate.text).verdict !== 'BLOCK',
  );

  if (control.mode === 'CANARY' && candidate && candidateValid) {
    const bucket = stablePromptBucket(input.rolloutKey);
    if (bucket < control.canaryPct) {
      return {
        version: candidate.version,
        text: candidate.text,
        rolloutMode: 'CANARY',
        baselineVersion: baseline?.version,
        candidateVersion: candidate.version,
        canaryPct: control.canaryPct,
        canaryBucket: bucket,
      };
    }
    return baseline ? {
      version: baseline.version,
      text: baseline.text,
      rolloutMode: 'BASELINE',
      baselineVersion: baseline.version,
      candidateVersion: candidate.version,
      canaryPct: control.canaryPct,
      canaryBucket: bucket,
    } : undefined;
  }

  if (baseline) {
    return {
      version: baseline.version,
      text: baseline.text,
      rolloutMode: control.mode === 'SHADOW' && candidateValid ? 'SHADOW' : 'BASELINE',
      baselineVersion: baseline.version,
      ...(candidateValid && candidate ? { candidateVersion: candidate.version } : {}),
    };
  }

  return undefined;
}
