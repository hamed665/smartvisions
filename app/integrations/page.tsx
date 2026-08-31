import Link from 'next/link';
import { verifyCrawl4AiIntegration, verifyEmailIntegration } from '@/app/integration-health-actions';
import { transcribeLatestWhatsAppVoicePilot, verifyWhatsAppIntegration } from '@/app/whatsapp-verification-actions';
import { updateIntegration } from '@/app/management-actions';
import { getCurrentOrganization } from '@/lib/supabase/org';
import { evaluateBudgetMode } from '@/lib/reliability/cost-guard';

export const dynamic = 'force-dynamic';

function whatsappCredentialsReady() {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN?.trim()
    || process.env.META_WHATSAPP_TOKEN?.trim()
    || process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim()
    || process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return Boolean(token && phoneNumberId);
}

function credentialReady(provider: string, channel: string) {
  switch (`${provider}:${channel}`) {
    case 'OPENAI:AI': return Boolean(process.env.OPENAI_API_KEY);
    case 'META:WHATSAPP': return whatsappCredentialsReady();
    case 'META:INSTAGRAM': return false;
    case 'GOOGLE_PLACES:DISCOVERY': return Boolean(process.env.GOOGLE_PLACES_API_KEY);
    case 'CRAWL4AI:AUDIT': return Boolean(process.env.CRAWL4AI_URL);
    case 'REDIS:QUEUE': return Boolean(process.env.REDIS_URL);
    case 'EMAIL_PROVIDER:EMAIL': return Boolean(process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER_API_KEY);
    default: return false;
  }
}

function effectiveStatus(status: string, credential: boolean) {
  if (!credential) return 'NOT_CONFIGURED';
  if (status === 'NOT_CONFIGURED') return 'READY';
  return status;
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export default async function IntegrationsPage() {
  const { supabase, organizationId, role } = await getCurrentOrganization();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const sinceVoice = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { data },
    { data: healthAudits },
    { data: costGuard },
    { data: usage },
    { data: controls },
    { data: recentInbound },
    { data: voiceTranscriptions },
    { data: pilotBusinesses },
  ] = await Promise.all([
    supabase.from('integration_connections').select('*').eq('organization_id', organizationId).order('provider').order('channel'),
    supabase.from('audit_logs').select('action,after_data,created_at').eq('organization_id', organizationId).in('action', ['CRAWL4AI_CONTROLLED_SMOKE_TEST', 'CRAWL4AI_CONTROLLED_SMOKE_TEST_FAILED', 'GOOGLE_PLACES_CONTROLLED_TEST', 'EMAIL_PROVIDER_CONTROLLED_VERIFICATION_SENT', 'EMAIL_PROVIDER_CONTROLLED_VERIFICATION_FAILED', 'META_WHATSAPP_CONTROLLED_VERIFICATION_SENT', 'META_WHATSAPP_CONTROLLED_VERIFICATION_FAILED']).order('created_at', { ascending: false }).limit(50),
    supabase.from('cost_guard_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('usage_events').select('cost_usd').eq('organization_id', organizationId).gte('created_at', monthStart.toISOString()),
    supabase.from('system_controls').select('shadow_mode,global_kill_switch,agents_paused,whatsapp_ai_paused').eq('organization_id', organizationId).maybeSingle(),
    supabase.from('outreach_messages').select('id,lead_id,provider_message_id,received_at,metadata').eq('organization_id', organizationId).eq('channel', 'WHATSAPP').eq('direction', 'INBOUND').not('lead_id', 'is', null).gte('received_at', sinceVoice).order('received_at', { ascending: false }).limit(50),
    supabase.from('voice_transcriptions').select('provider_message_id,status,detected_language,error_message,updated_at').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(20),
    supabase.from('businesses').select('leads(id)').eq('organization_id', organizationId).eq('category', 'INTERNAL_TEST').not('whatsapp', 'is', null).limit(2),
  ]);

  const rows = data ?? [];
  const editable = role === 'OWNER';
  const monthSpend = (usage ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);
  const budget = costGuard ? evaluateBudgetMode(monthSpend, costGuard) : null;
  const latencyByProvider = new Map<string, number>();
  for (const event of healthAudits ?? []) {
    const after = (event.after_data ?? {}) as Record<string, unknown>;
    const provider = String(after.provider ?? (event.action.startsWith('CRAWL4AI') ? 'CRAWL4AI' : event.action.startsWith('EMAIL_PROVIDER') ? 'EMAIL_PROVIDER' : event.action.startsWith('META_WHATSAPP') ? 'META' : 'GOOGLE_PLACES'));
    const latency = Number(after.latencyMs);
    if (!latencyByProvider.has(provider) && Number.isFinite(latency)) latencyByProvider.set(provider, latency);
  }

  const pilotLeadIds = new Set<string>();
  for (const business of pilotBusinesses ?? []) {
    const leads = Array.isArray(business.leads) ? business.leads : [];
    for (const lead of leads) {
      if (lead && typeof lead === 'object' && 'id' in lead) pilotLeadIds.add(String(lead.id));
    }
  }
  const latestVoice = (recentInbound ?? []).find((row) => {
    const metadata = recordValue(row.metadata);
    return pilotLeadIds.has(String(row.lead_id ?? ''))
      && metadata.voice === true
      && typeof metadata.media_id === 'string'
      && Boolean(metadata.media_id)
      && typeof metadata.conversation_id === 'string'
      && Boolean(metadata.conversation_id)
      && Boolean(row.provider_message_id);
  });
  const latestVoiceEvidence = latestVoice
    ? (voiceTranscriptions ?? []).find((row) => row.provider_message_id === latestVoice.provider_message_id)
    : undefined;
  const whatsappRuntime = rows.find((row) => row.provider === 'META' && row.channel === 'WHATSAPP');
  const openAiRuntime = rows.find((row) => row.provider === 'OPENAI' && row.channel === 'AI');
  const voiceControlsClear = Boolean(
    controls?.shadow_mode
    && !controls?.global_kill_switch
    && !controls?.agents_paused
    && !controls?.whatsapp_ai_paused,
  );
  const voicePilotReady = Boolean(
    editable
    && latestVoice
    && voiceControlsClear
    && whatsappRuntime?.status === 'CONNECTED'
    && whatsappRuntime?.enabled === true
    && openAiRuntime?.status === 'CONNECTED'
    && openAiRuntime?.enabled === true,
  );

  return <div>
    <div className="headerRow">
      <div>
        <h1>Integrations</h1>
        <p className="muted">Credential readiness is channel-specific and separate from a verified end-to-end connection. Secrets remain in secure environment storage and checks never run merely because this page loaded.</p>
      </div>
      <div>
        <span className="status">{rows.filter((r) => credentialReady(String(r.provider), String(r.channel))).length}/{rows.length} credentials present</span>
        {budget ? <span className={`status ${budget.mode === 'CRITICAL' || budget.mode === 'HARD_STOP' ? 'dangerStatus' : ''}`}>Budget {budget.mode}</span> : null}
      </div>
    </div>

    {budget?.mode === 'CRITICAL' || budget?.mode === 'HARD_STOP' ? <section className="panel dangerPanel">
      <strong>Critical cost state</strong>
      <p className="muted">New paid provider operations are restricted by Cost Guard. Review <Link className="textLink" href="/cost-usage">Cost & Usage</Link> before running smoke tests.</p>
    </section> : null}

    <div className="settingsList">
      {rows.map((r) => {
        const provider = String(r.provider);
        const channel = String(r.channel);
        const credential = credentialReady(provider, channel);
        const status = effectiveStatus(String(r.status), credential);
        const latency = latencyByProvider.get(provider);
        const isWhatsApp = provider === 'META' && channel === 'WHATSAPP';
        return <form action={updateIntegration} className="settingsRow" key={r.id}>
          <input type="hidden" name="id" value={r.id} />
          <div>
            <strong>{provider}</strong>
            <span className="muted smallText">{channel} · Health {status}</span>
            <span className={`smallText ${credential ? 'credentialReady' : 'credentialMissing'}`}>{credential ? (status === 'CONNECTED' ? 'Credential present · production verified' : 'Credential present · not production verified') : 'Credential missing'}</span>
            {provider === 'GOOGLE_PLACES' ? <Link className="textLink smallText" href="/hunters/google-places">Controlled discovery test →</Link> : null}
            {provider === 'CRAWL4AI' ? <span className="muted smallText">Smoke test uses one fixed example.com audit only when you click Verify.</span> : null}
            {provider === 'EMAIL_PROVIDER' ? <span className="muted smallText">Verification sends one owner-triggered email only. Provider stays disabled until delivery is confirmed.</span> : null}
            {isWhatsApp ? <>
              <span className="muted smallText">Enter the destination number only for the legacy provider verification. The controlled voice proof never sends outbound and uses only the latest real linked INTERNAL_TEST voice.</span>
              <span className="muted smallText">Voice pilot: {latestVoice ? (latestVoiceEvidence ? `${latestVoiceEvidence.status}${latestVoiceEvidence.detected_language ? ` · ${latestVoiceEvidence.detected_language}` : ''}` : 'real voice ready for transcription') : 'waiting for a real INTERNAL_TEST voice note'}</span>
            </> : null}
            {provider === 'META' && channel === 'INSTAGRAM' ? <span className="muted smallText">Instagram is intentionally deferred and has separate credentials from WhatsApp.</span> : null}
          </div>
          <label>Account label<input name="account_label" defaultValue={r.account_label ?? ''} disabled={!editable} /></label>
          <label className="toggleLabel"><input type="checkbox" name="enabled" defaultChecked={r.enabled} disabled={!editable || !credential} /> Enabled</label>
          <div className="healthList compactHealth">
            <span>Status <strong>{status}</strong></span>
            <span>Latency <strong>{latency !== undefined ? `${latency} ms` : '—'}</strong></span>
            <span>Last check <strong>{r.last_checked_at ? new Date(r.last_checked_at).toLocaleString() : 'Never'}</strong></span>
            {r.last_error ? <span>Error <strong>{r.last_error}</strong></span> : null}
          </div>
          <div>
            {provider === 'EMAIL_PROVIDER' && channel === 'EMAIL' ? <>
              <input name="test_email" type="email" placeholder="Verification recipient" disabled={!editable || !credential} />
              <button type="submit" formAction={verifyEmailIntegration} disabled={!editable || !credential}>Send verification email</button>
            </> : null}
            {isWhatsApp ? <>
              <input name="test_whatsapp" inputMode="tel" autoComplete="tel" placeholder="e.g. 9689XXXXXXX" disabled={!editable} />
              <button type="submit" formAction={verifyWhatsAppIntegration} disabled={!editable || !credential}>Verify WhatsApp once</button>
              <button type="submit" formAction={transcribeLatestWhatsAppVoicePilot} disabled={!voicePilotReady}>Transcribe latest test voice</button>
            </> : null}
            {provider === 'CRAWL4AI' && channel === 'AUDIT' ? <button type="submit" formAction={verifyCrawl4AiIntegration} disabled={!editable || !credential}>Verify once</button> : null}
            <button type="submit" disabled={!editable}>Save label/state</button>
          </div>
        </form>;
      })}
    </div>

    <section className="panel settingsCreate">
      <h2>Security and cost note</h2>
      <p className="muted">READY means credentials exist for that exact provider/channel but the provider is not yet verified. CONNECTED means durable production evidence exists. Manual provider verification is intentionally explicit so health monitoring cannot quietly become a paid traffic generator.</p>
    </section>
  </div>;
}
