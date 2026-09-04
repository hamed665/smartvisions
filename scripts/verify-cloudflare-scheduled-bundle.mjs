import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repoRoot, 'dist', 'server', 'wrangler.json');
const expectedCron = '*/2 * * * *';

function fail(message) {
  console.error(`Cloudflare scheduled bundle verification failed: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(configPath)) fail('dist/server/wrangler.json is missing; run the Vinext build first');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const crons = Array.isArray(config?.triggers?.crons) ? config.triggers.crons : [];
if (!crons.includes(expectedCron)) fail(`expected cron ${expectedCron} is missing from the built Wrangler config`);

const main = typeof config.main === 'string' ? config.main.trim() : '';
if (!main) fail('built Wrangler config has no main entry');
const entryPath = path.resolve(path.dirname(configPath), main);
if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
  fail(`built Worker entry does not exist: ${path.relative(repoRoot, entryPath)}`);
}

const extensions = ['', '.js', '.mjs', '.cjs', '.ts', '.tsx'];
const visited = new Set();
const chunks = [];

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = path.resolve(path.dirname(fromFile), specifier);
  for (const extension of extensions) {
    const file = candidate + extension;
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  for (const extension of ['.js', '.mjs', '.cjs', '.ts', '.tsx']) {
    const file = path.join(candidate, `index${extension}`);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function collect(file) {
  const normalized = path.resolve(file);
  if (visited.has(normalized)) return;
  visited.add(normalized);
  const source = fs.readFileSync(normalized, 'utf8');
  chunks.push(source);

  const importPatterns = [
    /\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const local = resolveLocalImport(normalized, match[1]);
      if (local) collect(local);
    }
  }
}

collect(entryPath);
const graphSource = chunks.join('\n');
const requiredMarkers = [
  '/api/operations/heartbeat',
  '/api/operations/tick',
  '/api/ai/process-inbound',
];
for (const marker of requiredMarkers) {
  if (!graphSource.includes(marker)) fail(`custom scheduled runtime marker is absent from the built entry graph: ${marker}`);
}
if (!/\bscheduled\b/.test(graphSource)) fail('built entry graph does not expose any scheduled handler token');

console.log(`Cloudflare scheduled bundle verified: cron=${expectedCron}; entry=${path.relative(repoRoot, entryPath)}; localGraphFiles=${visited.size}.`);
