import { createService, updateService } from '@/app/control-center-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const { data } = await supabase.from('services').select('id,name,enabled').eq('organization_id', organizationId).order('name');
  const services = data ?? [];
  const editable = role === 'OWNER';

  return <div>
    <div className="headerRow"><div><h1>Services</h1><p className="muted">Live service catalog used by sales agents and quotations.</p></div><span className="status">{services.length} services</span></div>
    <div className="settingsList">
      {services.map((service) => <form action={updateService} className="settingsRow" key={service.id}>
        <input type="hidden" name="id" value={service.id} />
        <div><strong>{service.id}</strong><span className="muted smallText">Internal service key</span></div>
        <label>Name<input name="name" defaultValue={service.name} disabled={!editable} /></label>
        <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={service.enabled} disabled={!editable} /> Enabled</label>
        <button disabled={!editable}>Save</button>
      </form>)}
    </div>
    {editable ? <section className="panel settingsCreate"><h2>Add service</h2><form action={createService} className="inlineForm"><label>Key<input name="id" placeholder="seo-package" required /></label><label>Name<input name="name" placeholder="SEO Package" required /></label><button>Add service</button></form></section> : null}
  </div>;
}
