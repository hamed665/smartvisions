const appId = (process.env.META_APP_ID || '').trim();
const appSecret = (process.env.META_APP_SECRET || '').trim();
const graphVersion = (process.env.META_GRAPH_VERSION || 'v23.0').trim();

function fail() {
  throw new Error('Meta App ID / App Secret pair could not be verified');
}

if (
  !/^[0-9]{5,32}$/.test(appId)
  || appSecret.length < 16
  || !/^v[0-9]+\.[0-9]+$/.test(graphVersion)
) {
  fail();
}

const url = new URL(
  `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(appId)}`,
);
url.searchParams.set('fields', 'id');

let response;
try {
  response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${appId}|${appSecret}`,
      Accept: 'application/json',
    },
  });
} catch {
  fail();
}

if (!response.ok) fail();

const body = await response.json().catch(() => null);
if (!body || String(body.id || '') !== appId) fail();

console.log('Meta App ID / App Secret pair verified without printing credential material.');