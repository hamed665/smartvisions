import { NextResponse } from 'next/server';

import {
  CustomerBusinessAccessError,
  loadCustomerBusinessAccessContext,
} from '@/lib/access/customer-business-scope';

export const dynamic = 'force-dynamic';

function statusFor(error: CustomerBusinessAccessError) {
  if (error.code === 'AUTHENTICATION_REQUIRED') return 401;
  if (error.code === 'INVALID_BUSINESS') return 400;
  if (error.code === 'BUSINESS_NOT_ACCESSIBLE') return 404;
  return 503;
}

export async function GET(request: Request) {
  try {
    const businessId = new URL(request.url).searchParams.get('businessId');
    const context = await loadCustomerBusinessAccessContext({
      requestedBusinessId: businessId,
    });

    return NextResponse.json({
      ok: true,
      businesses: context.businesses,
      selectedBusiness: context.selectedBusiness,
    }, {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    if (error instanceof CustomerBusinessAccessError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        {
          status: statusFor(error),
          headers: { 'Cache-Control': 'private, no-store' },
        },
      );
    }

    console.error('Customer Business context failed');
    return NextResponse.json(
      { error: 'Customer Business context unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'private, no-store' },
      },
    );
  }
}
