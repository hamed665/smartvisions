import { NextResponse } from 'next/server';
import { requireInternalApiKey } from '@/lib/security/internal-api';
import { runSahraFastInbound } from '@/lib/whatsapp/sahra-fast-inbound';

export async function POST(request: Request) {
  const authError = requireInternalApiKey(request);
  if (authError) return authError;
  if (process.env.DEPLOYMENT_ENV !== 'production') {
    return NextResponse.json({ error: 'Production scheduled runtime required' }, { status: 423 });
  }
  const body = await request.json().catch(() => null) as { scheduledTime?: unknown } | null;
  const scheduledTime = body?.scheduledTime;
  const now = Date.now();
  if (typeof scheduledTime !== 'number' || !Number.isFinite(scheduledTime)
    || scheduledTime > now || now - scheduledTime >= 60_000) {
    return NextResponse.json({ error: 'Fresh scheduled window required' }, { status: 400 });
  }
  try {
    const metrics = await runSahraFastInbound({
      DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
      INTERNAL_API_KEY: process.env.INTERNAL_API_KEY,
    }, scheduledTime);
    return NextResponse.json({ metrics });
  } catch {
    return NextResponse.json({ error: 'Sahra inbound runtime temporarily unavailable' }, { status: 503 });
  }
}
