import { loadSaasCouponOverview } from '@/lib/saas/coupons';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: 3,
  }).format(value);
}

function date(value: string) {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString('en-GB') : value;
}

export default async function CouponsPage() {
  const current = await getCurrentOrganization();

  if (!['OWNER', 'ADMIN'].includes(String(current.role))) {
    return <div className="panel">
      <h1>SaaS Coupons</h1>
      <p className="muted">Coupon evidence is limited to Organization OWNER/ADMIN roles.</p>
    </div>;
  }

  const overview = await loadSaasCouponOverview({
    supabase: current.supabase,
    organizationId: current.organizationId,
  });

  return <div>
    <div className="headerRow">
      <div>
        <h1>SaaS Coupons</h1>
        <p className="muted">
          Applied Smart Visions platform-billing coupon evidence. Coupon creation and redemption remain governed server commands.
        </p>
      </div>
      <span className="status">{overview.redemptions.length} redemptions</span>
    </div>

    <section className="panel">
      <h2>Coupon authority</h2>
      <div className="settingsList">
        <div className="settingsRow"><strong>Status</strong><span>Available</span></div>
        <div className="settingsRow"><strong>Stacking</strong><span>One coupon per billing statement</span></div>
        <div className="settingsRow"><strong>Payment collection</strong><span>Not performed by coupons</span></div>
      </div>
    </section>

    <section className="panel">
      <h2>Applied coupons</h2>
      {overview.redemptions.length === 0
        ? <p className="muted">No platform coupon has been applied to this Organization.</p>
        : <div className="settingsList">
            {overview.redemptions.map(redemption => <div className="panel" key={redemption.id}>
              <div className="headerRow">
                <div>
                  <strong>{redemption.couponName}</strong>
                  <p className="muted smallText">
                    {redemption.couponCode} · {redemption.benefitType} · {date(redemption.redeemedAt)}
                  </p>
                </div>
                <span className="status">-{money(redemption.discountAmount, redemption.currency)}</span>
              </div>
              <p className="muted smallText">Statement: {redemption.statementId}</p>
            </div>)}
          </div>}
    </section>
  </div>;
}
