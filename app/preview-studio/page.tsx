import { PreviewCanvas } from '@/components/preview/PreviewCanvas';
import { generatePreview } from '@/lib/preview/engine';
import { evaluatePreviewQuality } from '@/lib/preview/quality';
import { PREVIEW_TEMPLATE_LIBRARY } from '@/lib/preview/templates';
import { updatePreviewTemplate } from '@/app/management-actions';
import { createPreviewTemplate } from '@/app/extended-actions';
import {
  approvePreview,
  generateControlledPreviewPilot,
  markControlledPreviewShared,
  markPreviewSent,
} from '@/app/preview-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { previewPublicPath } from '@/lib/preview/lifecycle';

export const dynamic = 'force-dynamic';

function recordValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export default async function PreviewStudioPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const [{ data: templateData }, { data: productionData }] = await Promise.all([
    supabase.from('preview_templates').select('*').eq('organization_id', organizationId).order('vertical'),
    supabase
      .from('previews')
      .select('id,lead_id,status,public_token,vertical,quality_score,expires_at,created_at,payload')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const templates = templateData ?? [];
  const productionPreviews = productionData ?? [];
  const editable = role === 'OWNER';
  const customerGradeBuiltIns = PREVIEW_TEMPLATE_LIBRARY.filter((template) => template.customerFacing);
  const preview = generatePreview({
    businessName: 'Northstar Dental',
    vertical: 'dental',
    countryCode: 'OM',
    language: 'bilingual',
    languageSource: 'owner',
    city: 'Muscat',
    services: ['Preventive Care', 'Cosmetic Dentistry', 'Smile Consultations'],
    whatsapp: '+96800000000',
    explicitRequest: true,
    intentScore: 75,
  });
  const quality = evaluatePreviewQuality(preview);

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Preview Studio</h1>
          <p className="muted">Customer-grade 2026 website concepts with explicit language, evidence-safe personalization and mobile-first quality gates.</p>
        </div>
        <span className="status">Quality {quality.score}/100 · {quality.passed ? 'PASS' : 'BLOCK'}</span>
      </div>

      <section className="panel">
        <h2>Controlled production proof</h2>
        <p className="muted">Owner-only launch proof. Website language must be customer/owner confirmed; country or conversation language is never used as a substitute. Generation is deterministic, uses the existing INTERNAL_TEST lead, keeps Shadow Mode on, creates no provider spend, and sends nothing to the test contact.</p>
        <form action={generateControlledPreviewPilot} className="settingsGrid">
          <label>
            Confirmed website language
            <select name="site_language" defaultValue="" required disabled={!editable}>
              <option value="" disabled>Choose before generating</option>
              <option value="ar">Arabic</option>
              <option value="en">English</option>
              <option value="bilingual">Arabic + English</option>
            </select>
          </label>
          <button disabled={!editable}>Generate controlled premium preview</button>
        </form>
      </section>

      <section className="twoCol">
        <div className="panel">
          <h2>Live customer-grade sample</h2>
          <p className="muted smallText">Bilingual sample. Use the language switch inside the preview and narrow the browser to inspect the mobile layout.</p>
          <PreviewCanvas preview={preview}/>
        </div>
        <div className="panel">
          <h2>Template policy</h2>
          <p className="muted">The built-in library is the zero-API-cost baseline. Organization templates remain optional overrides; Preview Director does not need an LLM call just to choose a layout.</p>
          <div className="healthList">
            <span>2026 built-ins <strong>{customerGradeBuiltIns.length}</strong></span>
            <span>Customer-grade <strong>{customerGradeBuiltIns.filter((template) => template.customerFacing).length}</strong></span>
            <span>DB overrides <strong>{templates.length}</strong></span>
            <span>Active DB overrides <strong>{templates.filter((template) => template.active).length}</strong></span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Production previews</h2>
        <p className="muted">Generation stays proposal-first. Customer-facing website previews require explicit site language and a passing 2026/mobile/evidence quality gate. Owner approval is still required before sharing.</p>
        <div className="settingsList">
          {productionPreviews.length ? productionPreviews.map((item) => {
            const payload = recordValue(item.payload);
            const metadata = recordValue(payload.metadata);
            const growthSource = recordValue(metadata.growth_source);
            const business = recordValue(growthSource.business);
            const lane = String(metadata.lane ?? item.vertical ?? 'UNKNOWN');
            const version = Number(metadata.version ?? 1);
            const siteLanguage = String(metadata.site_language ?? '—');
            const publicPath = previewPublicPath(String(item.public_token));
            const shareable = item.status === 'SENT' || item.status === 'VIEWED';
            const controlledInternal = String(business.category ?? '') === 'INTERNAL_TEST';
            return (
              <div className="settingsRow" key={item.id}>
                <div>
                  <strong>{lane} · v{version}</strong>
                  <span className="muted smallText">{item.status} · Quality {item.quality_score}/100 · Language {siteLanguage}</span>
                  {controlledInternal ? <span className="muted smallText">Controlled INTERNAL_TEST preview · no external recipient</span> : null}
                </div>
                <div>
                  {item.status === 'GENERATED' && editable ? (
                    <form action={approvePreview}>
                      <input type="hidden" name="preview_id" value={item.id}/>
                      <button>Approve</button>
                    </form>
                  ) : null}
                  {item.status === 'APPROVED' && editable ? (
                    <form action={controlledInternal ? markControlledPreviewShared : markPreviewSent}>
                      <input type="hidden" name="preview_id" value={item.id}/>
                      <button>{controlledInternal ? 'Mark internal test shared' : 'Mark shared'}</button>
                    </form>
                  ) : null}
                  {shareable ? <a href={publicPath} target="_blank" rel="noreferrer">Open public preview</a> : null}
                </div>
              </div>
            );
          }) : <p className="muted">No production previews yet.</p>}
        </div>
      </section>

      <div className="settingsList">
        {templates.map((template) => (
          <form action={updatePreviewTemplate} className="settingsRow" key={template.id}>
            <input type="hidden" name="id" value={template.id}/>
            <div>
              <strong>{template.vertical}</strong>
              <span className="muted smallText">{template.id}</span>
            </div>
            <label>Name<input name="name" defaultValue={template.name} disabled={!editable}/></label>
            <label>Quality<select name="quality_tier" defaultValue={template.quality_tier} disabled={!editable}><option>STANDARD</option><option>PREMIUM</option><option>EXPERIMENTAL</option></select></label>
            <label className="toggleLabel"><input type="checkbox" name="active" defaultChecked={template.active} disabled={!editable}/> Active</label>
            <button disabled={!editable}>Save</button>
          </form>
        ))}
      </div>

      {editable ? (
        <section className="panel settingsCreate">
          <h2>Add template override</h2>
          <p className="muted smallText">Use this only when an organization-specific override is genuinely needed. Built-in customer-grade templates remain the safe default.</p>
          <form action={createPreviewTemplate} className="settingsGrid">
            <label>Template key<input name="id" placeholder="restaurant-premium" required/></label>
            <label>Vertical<input name="vertical" placeholder="restaurant" required/></label>
            <label>Name<input name="name" placeholder="Premium Restaurant" required/></label>
            <label>Quality<select name="quality_tier"><option>PREMIUM</option><option>STANDARD</option><option>EXPERIMENTAL</option></select></label>
            <button>Add template</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
