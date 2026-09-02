export const runtime = 'nodejs';

export async function GET() {
  if (process.env.DEPLOYMENT_ENV !== 'candidate') {
    return new Response(null, { status: 404 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ ok: false, reason: 'CONFIG_MISSING' }, { status: 503 });
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/previews?select=id&limit=0`, {
      headers: { apikey: key, accept: 'application/json' },
    });
    return Response.json({ ok: response.ok, upstreamStatus: response.status }, { status: response.ok ? 200 : 502 });
  } catch (error) {
    return Response.json({ ok: false, reason: error instanceof Error ? error.name : 'UnknownError' }, { status: 502 });
  }
}
