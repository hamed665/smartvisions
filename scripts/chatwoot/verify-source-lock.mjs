#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function fail(message) {
  console.error(`[chatwoot-source] ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireValue(condition, message) {
  if (!condition) fail(message);
}

function gitHead(directory) {
  try {
    return execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    fail(`cannot read upstream git HEAD: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function verifyLock(lock) {
  requireValue(lock.schemaVersion === 1, 'schemaVersion must be 1');
  requireValue(lock.workPackage === 'COMM-CHATWOOT-SOURCE', 'unexpected workPackage');
  requireValue(lock.upstream?.repository === 'chatwoot/chatwoot', 'unexpected upstream repository');
  requireValue(/^v\d+\.\d+\.\d+$/.test(lock.upstream?.tag ?? ''), 'upstream tag must be a stable semantic release tag');
  requireValue(/^[0-9a-f]{40}$/.test(lock.upstream?.commit ?? ''), 'upstream commit must be a full 40-character SHA');
  requireValue(lock.license?.communityPolicy === 'MIT_EXCEPT_ENTERPRISE', 'community license policy is not locked');
  requireValue(lock.license?.enterpriseProductionUse === 'LICENSE_REQUIRED', 'enterprise production policy is not locked');
  requireValue(lock.license?.enterpriseFilesInProductionImage === false, 'enterprise source must be absent from Production image');
  requireValue(lock.license?.runtimeDisableEnterprise === true, 'runtime Enterprise disable guard must remain enabled');
  requireValue(lock.image?.registry === 'ghcr.io/hamed665/smartvisions-chatwoot', 'unexpected Chatwoot image registry');
  requireValue(lock.image?.allowLatestTag === false, 'floating latest tag is prohibited');
  requireValue(lock.image?.requireImmutableDeploymentDigest === true, 'Production must require immutable image digest');
  requireValue(lock.integration?.providerAuthority === 'SMART_CORE', 'provider authority must remain Smart Core');
  requireValue(lock.integration?.initialChatwootChannel === 'Channel::Api', 'initial Chatwoot channel must remain API Inbox');
  requireValue(lock.integration?.nativeEmailProviderOwnership === false, 'Chatwoot native Email provider ownership must remain disabled');
  requireValue(lock.integration?.nativeWhatsAppProviderOwnership === false, 'Chatwoot native WhatsApp provider ownership must remain disabled');
}

function verifyPatchBoundary(rootDir) {
  const patchesDir = path.join(rootDir, 'ops', 'chatwoot', 'patches');
  if (!fs.existsSync(patchesDir)) return;

  const patches = fs.readdirSync(patchesDir)
    .filter(name => name.endsWith('.patch'))
    .sort();

  for (const patchName of patches) {
    const patch = fs.readFileSync(path.join(patchesDir, patchName), 'utf8');
    if (/^(?:---|\+\+\+)\s+(?:a\/|b\/)?enterprise\//m.test(patch)
        || /^diff --git a\/enterprise\//m.test(patch)) {
      fail(`patch ${patchName} modifies proprietary enterprise/ source`);
    }
  }
}

function verifyUpstream(lock, upstreamDir) {
  requireValue(fs.existsSync(upstreamDir), `upstream directory does not exist: ${upstreamDir}`);
  requireValue(gitHead(upstreamDir) === lock.upstream.commit, 'checked-out upstream commit does not match source lock');

  const packageJson = readJson(path.join(upstreamDir, 'package.json'));
  requireValue(packageJson.name === '@chatwoot/chatwoot', 'unexpected upstream package name');
  requireValue(`v${packageJson.version}` === lock.upstream.tag, 'package version does not match pinned tag');
  requireValue(packageJson.engines?.node === '24.x', 'unexpected upstream Node engine');
  requireValue(packageJson.engines?.pnpm === '10.x', 'unexpected upstream pnpm engine');

  const gemfile = fs.readFileSync(path.join(upstreamDir, 'Gemfile'), 'utf8');
  requireValue(gemfile.includes("ruby '3.4.4'"), 'upstream Ruby version drifted');
  requireValue(gemfile.includes("gem 'rails', '7.2.3.1'"), 'upstream Rails version drifted');

  const dockerfile = fs.readFileSync(path.join(upstreamDir, 'docker', 'Dockerfile'), 'utf8');
  requireValue(dockerfile.includes('ARG NODE_VERSION="24.13.0"'), 'upstream Docker Node pin drifted');
  requireValue(dockerfile.includes('ARG PNPM_VERSION="10.2.0"'), 'upstream Docker pnpm pin drifted');

  const communityLicense = fs.readFileSync(path.join(upstreamDir, lock.license.communityLicensePath), 'utf8');
  requireValue(communityLicense.includes('enterprise/'), 'root license no longer identifies enterprise/ boundary');
  requireValue(communityLicense.includes('MIT Expat'), 'root license no longer states MIT Expat community terms');

  const enterpriseLicense = fs.readFileSync(path.join(upstreamDir, lock.license.enterpriseLicensePath), 'utf8');
  requireValue(
    enterpriseLicense.includes('may only be\nused in production')
      || enterpriseLicense.includes('may only be\r\nused in production'),
    'enterprise production-license boundary changed; manual legal review required',
  );
  requireValue(
    enterpriseLicense.includes('valid Chatwoot Enterprise License'),
    'enterprise license requirement changed; manual legal review required',
  );
}

const args = process.argv.slice(2);
const lockPath = path.resolve(args[0] ?? 'ops/chatwoot/source.lock.json');
const upstreamFlag = args.indexOf('--upstream-dir');
const upstreamDir = upstreamFlag >= 0 ? path.resolve(args[upstreamFlag + 1] ?? '') : null;
const repoRoot = path.resolve(path.dirname(lockPath), '..', '..');

const lock = readJson(lockPath);
verifyLock(lock);
verifyPatchBoundary(repoRoot);
if (upstreamDir) verifyUpstream(lock, upstreamDir);

console.log(JSON.stringify({
  ok: true,
  workPackage: lock.workPackage,
  upstream: `${lock.upstream.tag}@${lock.upstream.commit}`,
  providerAuthority: lock.integration.providerAuthority,
  initialChatwootChannel: lock.integration.initialChatwootChannel,
}));
