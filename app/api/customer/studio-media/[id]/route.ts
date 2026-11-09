import { NextResponse } from 'next/server';
import { customerStudioScope } from '@/lib/access/customer-studio';
import { normalizeCustomerBusinessId } from '@/lib/access/customer-business-scope';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { downloadMetaWhatsAppMediaForChatwoot } from '@/lib/whatsapp/media';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';
import { isStudioPlayableAudio, studioAudioEvidence, studioAudioRange } from '@/lib/voice/studio-media';

const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
const unavailable = () => NextResponse.json({ error: 'Audio is unavailable in this workspace.' }, { status: 404, headers });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { searchParams } = new URL(request.url);
  const businessId = normalizeCustomerBusinessId(searchParams.get('businessId'));
  const threadId = normalizeCustomerBusinessId(searchParams.get('thread'));
  const messageId = normalizeCustomerBusinessId((await params).id);
  if (!businessId || !threadId || !messageId) return unavailable();

  const { supabase, business } = await customerStudioScope(businessId);
  const projection = await supabase.from('unified_inbox_conversation_projections')
    .select('branch_id,communication_channel_binding_id')
    .eq('organization_id', business.organizationId).eq('tenant_business_id', business.id)
    .eq('conversation_id', threadId).in('lifecycle_status', ['ACTIVE', 'DEGRADED']).maybeSingle();
  if (projection.error || !projection.data) return unavailable();

  const row = await supabase.from('conversation_messages')
    .select('metadata,direction,source_plane,media_type,provider_message_id')
    .eq('organization_id', business.organizationId).eq('conversation_id', threadId)
    .eq('channel', 'WHATSAPP').eq('id', messageId).maybeSingle();
  if (row.error || !row.data) return unavailable();

  const bindingId = projection.data.communication_channel_binding_id;
  const evidence = studioAudioEvidence({
    metadata: row.data.metadata, direction: row.data.direction, sourcePlane: row.data.source_plane,
    mediaType: row.data.media_type, providerMessageId: row.data.provider_message_id,
  }, business.id, bindingId);
  if (!evidence) return unavailable();

  try {
    const provider = await resolveMetaWhatsAppProvider({
      service: createSupabaseServiceClient(), organizationId: business.organizationId,
      tenantBusinessId: business.id, branchId: projection.data.branch_id,
    });
    if (provider.bindingId !== bindingId) return unavailable();
    const audio = await downloadMetaWhatsAppMediaForChatwoot({ ...evidence,
      expectedMimeType: evidence.mimeType, accessToken: provider.accessToken,
    });
    if (!isStudioPlayableAudio(audio.contentType)) return unavailable();

    const responseHeaders = { ...headers, 'Content-Type': audio.contentType, 'Accept-Ranges': 'bytes' };
    const range = request.headers.get('range');
    if (!range) return new Response(audio.blob, {
      headers: { ...responseHeaders, 'Content-Length': String(audio.blob.size) },
    });
    const bounds = studioAudioRange(range, audio.blob.size);
    if (!bounds) return new Response(null, {
      status: 416, headers: { ...responseHeaders, 'Content-Range': 'bytes */'+audio.blob.size },
    });
    const { start, end } = bounds;
    return new Response(audio.blob.slice(start, end + 1), {
      status: 206,
      headers: { ...responseHeaders, 'Content-Length': String(end - start + 1), 'Content-Range': 'bytes '+start+'-'+end+'/'+audio.blob.size },
    });
  } catch {
    return unavailable();
  }
}
