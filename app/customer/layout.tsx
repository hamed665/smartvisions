import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  CustomerBusinessAccessError,
  loadCustomerBusinessAccessContext,
} from '@/lib/access/customer-business-scope';

export const dynamic = 'force-dynamic';

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  try {
    const context = await loadCustomerBusinessAccessContext({});

    if (!context.selectedBusiness) {
      return (
        <div>
          <div className="headerRow">
            <div>
              <p className="eyebrow">SMART VISIONS BUSINESS OS</p>
              <h1>Business access required</h1>
              <p className="muted">Your account is active, but no Business scope is assigned yet.</p>
            </div>
          </div>
          <section className="panel">
            <h2>No Business workspace is available</h2>
            <p className="muted">
              Ask the Business owner to invite this account to a specific Business. Smart Visions will not grant Organization-wide access implicitly.
            </p>
            <Link className="textLink" href="/auth/forgot-password">Account help →</Link>
          </section>
        </div>
      );
    }

    return <>{children}</>;
  } catch (error) {
    if (
      error instanceof CustomerBusinessAccessError
      && error.code === 'AUTHENTICATION_REQUIRED'
    ) {
      redirect('/login');
    }
    throw error;
  }
}
