import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseEnv,
  validateRuntimeContract,
} from '../scripts/chatwoot/verify-runtime-contract.mjs';

function validRuntime() {
  return {
    SMARTVISIONS_CHATWOOT_ENV: 'candidate',
    CHATWOOT_IMAGE: 'ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0-sv-1234567890123456789012345678901234567890@sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    RAILS_ENV: 'production',
    NODE_ENV: 'production',
    INSTALLATION_ENV: 'docker',
    DISABLE_ENTERPRISE: 'true',
    FRONTEND_URL: 'https://candidate-inbox.smartvisions-test.net',
    FORCE_SSL: 'true',
    ENABLE_ACCOUNT_SIGNUP: 'false',
    SECRET_KEY_BASE: 'secret-key-base',
    ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY: 'primary-key',
    ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY: 'deterministic-key',
    ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT: 'derivation-salt',
    POSTGRES_HOST: 'candidate-postgres.internal',
    POSTGRES_PORT: '5432',
    POSTGRES_DATABASE: 'chatwoot',
    POSTGRES_USERNAME: 'chatwoot',
    POSTGRES_PASSWORD: 'postgres-secret',
    REDIS_URL: 'rediss://candidate-redis.internal:6379',
    REDIS_PASSWORD: 'redis-secret',
    ACTIVE_STORAGE_SERVICE: 's3_compatible',
    STORAGE_BUCKET_NAME: 'chatwoot-candidate',
    STORAGE_ACCESS_KEY_ID: 'storage-key',
    STORAGE_SECRET_ACCESS_KEY: 'storage-secret',
    STORAGE_REGION: 'auto',
    STORAGE_ENDPOINT: 'https://storage.example.com',
    STORAGE_FORCE_PATH_STYLE: 'false',
    MAILER_SENDER_EMAIL: '',
    SMTP_ADDRESS: '',
    SMTP_USERNAME: '',
    SMTP_PASSWORD: '',
    CHATWOOT_WEBHOOK_PUBLIC_ORIGIN: '',
  };
}

describe('Chatwoot Candidate runtime contract', () => {
  it('accepts the committed safe Candidate template', () => {
    const env = parseEnv(fs.readFileSync('ops/chatwoot/.env.candidate.example', 'utf8'));
    expect(validateRuntimeContract(env, { tier: 'candidate', template: true })).toEqual([]);
  });

  it('accepts a resolved isolated Candidate runtime', () => {
    expect(validateRuntimeContract(validRuntime(), { tier: 'candidate' })).toEqual([]);
  });

  it('rejects Production hostname and Smart Core database reuse', () => {
    const env = validRuntime();
    env.FRONTEND_URL = 'https://inbox.smartvisionsai.com';
    env.POSTGRES_HOST = 'db.pkypexzpyfbikdnkrzvw.supabase.co';
    const errors = validateRuntimeContract(env, { tier: 'candidate' });
    expect(errors.some(error => error.includes('Production Chatwoot hostname'))).toBe(true);
    expect(errors.some(error => error.includes('Smart Core Supabase'))).toBe(true);
  });

  it('rejects floating or fake deployment images', () => {
    const latest = validRuntime();
    latest.CHATWOOT_IMAGE = 'ghcr.io/hamed665/smartvisions-chatwoot:latest';
    expect(validateRuntimeContract(latest, { tier: 'candidate' }).some(error => error.includes('immutable sha256'))).toBe(true);

    const zeros = validRuntime();
    zeros.CHATWOOT_IMAGE = 'ghcr.io/hamed665/smartvisions-chatwoot:v4.18.0@sha256:' + '0'.repeat(64);
    expect(validateRuntimeContract(zeros, { tier: 'candidate' }).some(error => error.includes('digest must be real'))).toBe(true);
  });

  it('rejects native provider and SMTP credentials in Candidate', () => {
    const env = validRuntime();
    env.WHATSAPP_CLOUD_TOKEN = 'forbidden';
    env.SMTP_PASSWORD = 'forbidden';
    const errors = validateRuntimeContract(env, { tier: 'candidate' });
    expect(errors.some(error => error.includes('WHATSAPP_CLOUD_TOKEN'))).toBe(true);
    expect(errors.some(error => error.includes('SMTP_PASSWORD'))).toBe(true);
  });

  it('rejects unresolved runtime secrets outside template mode', () => {
    const env = validRuntime();
    env.SECRET_KEY_BASE = '__SECRET_STORE__';
    expect(validateRuntimeContract(env, { tier: 'candidate' }).some(error => error.includes('SECRET_KEY_BASE'))).toBe(true);
  });
});
