import { NextResponse } from 'next/server';
import { Crawl4AiAuditor } from '@/lib/audit/crawl4ai';
import { requireInternalApiKey } from '@/lib/security/internal-api';

export async function POST(request: Request) {
  const denied = requireInternalApiKey(request);
  if (denied) return denied;

  const crawl4aiUrl = process.env.CRAWL4AI_URL;
  if (!crawl4aiUrl) return NextResponse.json({ error: 'CRAWL4AI_URL is not configured' }, { status: 503 });

  const body = (await request.json()) as { url?: string };
  if (!body.url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  try {
    const parsed = new URL(body.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol');
  } catch {
    return NextResponse.json({ error: 'A valid http/https URL is required' }, { status: 400 });
  }

  const auditor = new Crawl4AiAuditor(crawl4aiUrl);
  const result = await auditor.audit(body.url);
  return NextResponse.json(result);
}
