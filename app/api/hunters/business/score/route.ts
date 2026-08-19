import { NextResponse } from 'next/server';
import { evaluateBusiness, type BusinessEvaluationInput } from '@/lib/hunters/business/evaluate';

export async function POST(request: Request) {
  const body = (await request.json()) as BusinessEvaluationInput;
  if (typeof body?.hasWebsite !== 'boolean') {
    return NextResponse.json({ error: 'hasWebsite is required' }, { status: 400 });
  }

  return NextResponse.json(evaluateBusiness(body));
}
