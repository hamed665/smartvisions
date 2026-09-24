#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SMART_CORE_REF = 'pkypexzpyfbikdnkrzvw';
const IMAGE_RE = /^ghcr\.io\/hamed665\/smartvisions-chatwoot:[^@\s]+@sha256:[0-9a-f]{64}$/i;
const SECRET_KEYS = [
  'SECRET_KEY_BASE',
  'ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY',
  'ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY',
  'ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT',
  'POSTGRES_PASSWORD',
  'REDIS_PASSWORD',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
];
const FORBIDDEN_PROVIDER_KEYS = [
  'WHATSAPP_CLOUD_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'META_ACCESS_TOKEN',
  'FACEBOOK_APP_SECRET',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'SENDGRID_API_KEY',
  'MAILGUN_API_KEY',
];

function cleanValue(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseEnv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    env[line.slice(0, index).trim()] = cleanValue(line.slice(index + 1));
  }
  return env;
}

function placeholder(value) {
  return /__[^\s]+__/.test(value ?? '');
}

function present(env, key) {
  return typeof env[key] === 'string' && env[key].trim().length > 0;
}

function expect(errors, condition, message) {
  if (!condition) errors.push(message);
}

export function validateRuntimeContract(env, { tier = 'candidate', template = false } = {}) {
  const errors = [];
  expect(errors, tier === 'candidate', 'only candidate runtime validation is currently permitted');
  expect(errors, env.SMARTVISIONS_CHATWOOT_ENV === 'candidate', 'SMARTVISIONS_CHATWOOT_ENV must be candidate');
  expect(errors, env.RAILS_ENV === 'production', 'RAILS_ENV must be production');
  expect(errors, env.NODE_ENV === 'production', 'NODE_ENV must be production');
  expect(errors, env.INSTALLATION_ENV === 'docker', 'INSTALLATION_ENV must be docker');
  expect(errors, env.DISABLE_ENTERPRISE === 'true', 'DISABLE_ENTERPRISE must be true');
  expect(errors, env.FORCE_SSL === 'true', 'FORCE_SSL must be true');
  expect(errors, env.ENABLE_ACCOUNT_SIGNUP === 'false', 'ENABLE_ACCOUNT_SIGNUP must be false');
  expect(errors, env.POSTGRES_DATABASE === 'chatwoot', 'POSTGRES_DATABASE must be chatwoot');
  expect(errors, env.ACTIVE_STORAGE_SERVICE === 's3_compatible', 'ACTIVE_STORAGE_SERVICE must be s3_compatible');

  const image = env.CHATWOOT_IMAGE ?? '';
  expect(errors, IMAGE_RE.test(image), 'CHATWOOT_IMAGE must be the Smart Visions GHCR image pinned by immutable sha256 digest');
  expect(errors, !/:latest(?:@|$)/i.test(image), 'CHATWOOT_IMAGE may not use latest');
  if (!template) expect(errors, !/@sha256:0{64}$/i.test(image), 'CHATWOOT_IMAGE digest must be real');

  let frontend;
  try {
    frontend = new URL(env.FRONTEND_URL ?? '');
  } catch {
    errors.push('FRONTEND_URL must be a valid HTTPS URL');
  }
  if (frontend) {
    expect(errors, frontend.protocol === 'https:', 'FRONTEND_URL must use HTTPS');
    expect(errors, frontend.username === '' && frontend.password === '', 'FRONTEND_URL may not contain credentials');
    expect(errors, frontend.pathname === '/' && !frontend.search && !frontend.hash, 'FRONTEND_URL must be an origin only');
    expect(errors, frontend.hostname !== 'inbox.smartvisionsai.com', 'candidate may not use the Production Chatwoot hostname');
    if (!template) expect(errors, !frontend.hostname.endsWith('.invalid'), 'candidate must use a real isolated hostname');
  }

  expect(errors, present(env, 'POSTGRES_HOST'), 'POSTGRES_HOST is required');
  expect(errors, !String(env.POSTGRES_HOST ?? '').includes(SMART_CORE_REF), 'candidate must not use the Smart Core Supabase database');
  expect(errors, /^rediss?:\/\//i.test(env.REDIS_URL ?? ''), 'REDIS_URL must use redis:// or rediss://');
  expect(errors, present(env, 'STORAGE_BUCKET_NAME'), 'STORAGE_BUCKET_NAME is required');
  expect(errors, /^https:\/\//i.test(env.STORAGE_ENDPOINT ?? ''), 'STORAGE_ENDPOINT must use HTTPS');
  expect(errors, ['true', 'false'].includes(env.STORAGE_FORCE_PATH_STYLE ?? ''), 'STORAGE_FORCE_PATH_STYLE must be true or false');

  for (const key of SECRET_KEYS) {
    expect(errors, present(env, key), `${key} is required`);
    if (!template && present(env, key)) {
      expect(errors, !placeholder(env[key]), `${key} must be resolved from the deployment secret store`);
    }
  }

  if (!template) {
    for (const key of ['POSTGRES_HOST', 'REDIS_URL', 'STORAGE_BUCKET_NAME', 'STORAGE_ENDPOINT']) {
      if (present(env, key)) expect(errors, !placeholder(env[key]), `${key} must be resolved for Candidate`);
    }
    const encryption = [
      env.ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY,
      env.ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY,
      env.ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT,
    ];
    expect(errors, new Set(encryption).size === encryption.length, 'Active Record encryption secrets must be distinct');
  }

  for (const key of FORBIDDEN_PROVIDER_KEYS) {
    expect(errors, !present(env, key), `${key} must not be configured in Candidate`);
  }
  for (const key of ['SMTP_ADDRESS', 'SMTP_USERNAME', 'SMTP_PASSWORD', 'MAILER_SENDER_EMAIL']) {
    expect(errors, !present(env, key), `${key} must remain empty in Candidate`);
  }
  expect(errors, !present(env, 'CHATWOOT_WEBHOOK_PUBLIC_ORIGIN'), 'CHATWOOT_WEBHOOK_PUBLIC_ORIGIN must remain empty before controlled bridge activation');
  return errors;
}

function runCli() {
  const args = process.argv.slice(2);
  const envPath = path.resolve(args[0] ?? 'ops/chatwoot/.env.candidate');
  const template = args.includes('--template');
  const tierIndex = args.indexOf('--tier');
  const tier = tierIndex >= 0 ? args[tierIndex + 1] : 'candidate';

  let env;
  try {
    env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  } catch (error) {
    console.error(`[chatwoot-runtime] cannot read ${envPath}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const errors = validateRuntimeContract(env, { tier, template });
  if (errors.length) {
    for (const error of errors) console.error(`[chatwoot-runtime] ${error}`);
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, tier, template, frontendOrigin: env.FRONTEND_URL, image: env.CHATWOOT_IMAGE }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) runCli();
