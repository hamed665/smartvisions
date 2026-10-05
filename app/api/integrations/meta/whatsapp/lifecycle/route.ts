import { NextResponse } from 'next/server';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { metaGraphVersion } from '@/lib/whatsapp/meta-onboarding';
import {
  MetaWhatsAppCredentialHealthError,
  readMetaWhatsAppBindingHealth,
  unsubscribeMetaWhatsAppBinding,
} from '@/lib/whatsapp/meta-provisioning';
import { resolveMetaWhatsAppProvider } from '@/lib/whatsapp/tenant-routing';

export const runtime = 'nodejs';

type LifecycleAction = 'VERIFY_HEALTH' | 'DISCONNECT';

type LifecycleBody = {
  action?: LifecycleAction;
  bindingId?: string;
  expectedVersion?: number;
};

type BindingRow = {
  id: string;
  version: number;
  tenant_business_id: string;
  branch_id: string | null;
  integration_connection_id: string;
  channel: string;
  status: string;
  provider: string | null;
  provider_account_id: string | null;
  provider_destination_id: string | null;
  last_error_code: string | null;
};

function cleanId(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= 200 ? text : null;
}

function safeHealthMessage(kind: 'INVALID_OR_REVOKED' | 'UNCONFIRMED' | 'SUBSCRIPTION_MISSING') {
  if (kind === 'INVALID_OR_REVOKED') {
    return 'Meta no longer accepts the stored WhatsApp credential. Reconnect this same API number with Meta.';
  }
  if (kind === 'SUBSCRIPTION_MISSING') {
    return 'The Meta app is no longer subscribed to this WhatsApp Business Account. Reconnect the same binding to restore it.';
  }
  return 'Meta could not confirm WhatsApp credential health. Provider actions are blocked until this same binding is reconnected.';
}

async function markHealth(input: {
  service: ReturnType<typeof createSupabaseServiceClient>;
  organizationId: string;
  bindingId: string;
  expectedVersion: number;
  actorUserId: string;
  state: 'VERIFIED' | 'CREDENTIAL_INVALID' | 'UNCONFIRMED' | 'SUBSCRIPTION_MISSING';
}) {
  const { data, error } = await input.service.rpc('mark_meta_whatsapp_binding_health', {
    p_organization_id: input.organizationId,
    p_binding_id: input.bindingId,
    p_expected_version: input.expectedVersion,
    p_health_state: input.state,
    p_actor_user_id: input.actorUserId,
    p_request_key: `meta-whatsapp-health:${input.bindingId}:${crypto.randomUUID()}`,
  });
  if (error) throw new Error('WhatsApp health evidence could not be committed safely');
  return Array.isArray(data) ? data[0] : data;
}

async function auditProviderDisconnect(input: {
  service: ReturnType<typeof createSupabaseServiceClient>;
  binding: BindingRow;
  organizationId: string;
  actorUserId: string;
  action:
    | 'META_WHATSAPP_PROVIDER_UNSUBSCRIBE_STARTED'
    | 'META_WHATSAPP_PROVIDER_UNSUBSCRIBED'
    | 'META_WHATSAPP_PROVIDER_UNSUBSCRIBE_RECONCILIATION_REQUIRED';
  providerUnsubscribeConfirmed: boolean;
  reason: string | null;
}) {
  const { error } = await input.service.from('audit_logs').insert({
    organization_id: input.organizationId,
    actor_type: 'USER',
    actor_id: input.actorUserId,
    action: input.action,
    entity_type: 'communication_channel_binding',
    entity_id: input.binding.id,
    tenant_business_id: input.binding.tenant_business_id,
    branch_id: input.binding.branch_id,
    after_data: {
      binding_id: input.binding.id,
      provider: 'META',
      provider_unsubscribe_confirmed: input.providerUnsubscribeConfirmed,
      provider_actions_blocked: true,
      mobile_whatsapp_account_changed: false,
      reconciliation_reason: input.reason,
    },
  });
  return !error;
}

export async function POST(request: Request) {
  try {
    const ctx = await getCurrentOrganization(true);
    const body = await request.json().catch(() => ({})) as LifecycleBody;
    const action = body.action;
    const bindingId = cleanId(body.bindingId);
    const expectedVersion = Number(body.expectedVersion);

    if (
      !bindingId
      || !Number.isInteger(expectedVersion)
      || expectedVersion < 1
      || (action !== 'VERIFY_HEALTH' && action !== 'DISCONNECT')
    ) {
      return NextResponse.json({ error: 'Invalid WhatsApp lifecycle request' }, { status: 400 });
    }

    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('communication_channel_bindings')
      .select('id,version,tenant_business_id,branch_id,integration_connection_id,channel,status,provider,provider_account_id,provider_destination_id,last_error_code')
      .eq('organization_id', ctx.organizationId)
      .eq('id', bindingId)
      .maybeSingle();

    const binding = data as BindingRow | null;
    if (
      error
      || !binding
      || binding.channel !== 'WHATSAPP'
      || binding.status !== 'ACTIVE'
      || binding.provider !== 'META'
      || !binding.provider_account_id
      || !binding.provider_destination_id
    ) {
      return NextResponse.json({ error: 'WhatsApp binding is not eligible for this lifecycle action' }, { status: 409 });
    }

    if (action === 'DISCONNECT' && binding.last_error_code === 'MANUAL_DISCONNECTED') {
      return NextResponse.json({
        ok: true,
        localDisconnected: true,
        alreadyDisconnected: true,
        providerUnsubscribeConfirmed: false,
        reconciliationRequired: true,
        version: binding.version,
        message: 'Smart Visions provider actions are already blocked. No provider mutation was repeated.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    if (binding.version !== expectedVersion) {
      return NextResponse.json({ error: 'WhatsApp binding changed before this action. Refresh and retry.' }, { status: 409 });
    }

    const appId = process.env.META_APP_ID?.trim() || process.env.NEXT_PUBLIC_META_APP_ID?.trim();
    if (!appId) {
      return NextResponse.json({ error: 'Smart Visions Meta provider configuration is not ready' }, { status: 503 });
    }

    if (action === 'VERIFY_HEALTH') {
      if (binding.last_error_code === 'MANUAL_DISCONNECTED') {
        return NextResponse.json({
          error: 'This WhatsApp binding is disconnected. Reconnect the same API number instead of creating a new connection.',
          reconnectRequired: true,
        }, { status: 409 });
      }

      try {
        const resolved = await resolveMetaWhatsAppProvider({
          service,
          organizationId: ctx.organizationId,
          tenantBusinessId: binding.tenant_business_id,
          branchId: binding.branch_id,
        });
        if (
          resolved.bindingId !== binding.id
          || resolved.wabaId !== binding.provider_account_id
          || resolved.phoneNumberId !== binding.provider_destination_id
        ) {
          throw new Error('Canonical WhatsApp credential no longer matches this binding');
        }

        const health = await readMetaWhatsAppBindingHealth({
          graphVersion: metaGraphVersion(),
          accessToken: resolved.accessToken,
          appId,
          wabaId: binding.provider_account_id,
          phoneNumberId: binding.provider_destination_id,
        });

        if (!health.subscriptionConfirmed) {
          await markHealth({
            service,
            organizationId: ctx.organizationId,
            bindingId: binding.id,
            expectedVersion,
            actorUserId: ctx.userId,
            state: 'SUBSCRIPTION_MISSING',
          });
          const checkedAt = new Date().toISOString();
          await service.from('integration_connections')
            .update({
              status: 'DEGRADED',
              last_checked_at: checkedAt,
              last_error: 'META_PROVIDER_SUBSCRIPTION_MISSING',
              updated_at: checkedAt,
            })
            .eq('organization_id', ctx.organizationId)
            .eq('id', binding.integration_connection_id);
          return NextResponse.json({
            error: safeHealthMessage('SUBSCRIPTION_MISSING'),
            reconnectRequired: true,
            health: 'SUBSCRIPTION_MISSING',
          }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
        }

        await markHealth({
          service,
          organizationId: ctx.organizationId,
          bindingId: binding.id,
          expectedVersion,
          actorUserId: ctx.userId,
          state: 'VERIFIED',
        });
        const checkedAt = new Date().toISOString();
        await service.from('integration_connections')
          .update({
            enabled: true,
            status: 'CONNECTED',
            last_checked_at: checkedAt,
            last_error: null,
            updated_at: checkedAt,
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', binding.integration_connection_id);

        return NextResponse.json({
          ok: true,
          verified: true,
          health: 'VERIFIED',
          displayPhoneNumber: health.displayPhoneNumber,
          verifiedName: health.verifiedName,
          qualityRating: health.qualityRating,
        }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (healthError) {
        const kind = healthError instanceof MetaWhatsAppCredentialHealthError
          ? healthError.kind
          : 'UNCONFIRMED';
        await markHealth({
          service,
          organizationId: ctx.organizationId,
          bindingId: binding.id,
          expectedVersion,
          actorUserId: ctx.userId,
          state: kind === 'INVALID_OR_REVOKED' ? 'CREDENTIAL_INVALID' : 'UNCONFIRMED',
        });
        const checkedAt = new Date().toISOString();
        await service.from('integration_connections')
          .update({
            status: 'DEGRADED',
            last_checked_at: checkedAt,
            last_error: kind === 'INVALID_OR_REVOKED'
              ? 'META_CREDENTIAL_INVALID_OR_REVOKED'
              : 'META_CREDENTIAL_HEALTH_UNCONFIRMED',
            updated_at: checkedAt,
          })
          .eq('organization_id', ctx.organizationId)
          .eq('id', binding.integration_connection_id);
        return NextResponse.json({
          error: safeHealthMessage(kind),
          reconnectRequired: true,
          health: kind,
        }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      }
    }

    let providerContext: {
      accessToken: string;
      wabaId: string;
    } | null = null;

    try {
      const resolved = await resolveMetaWhatsAppProvider({
        service,
        organizationId: ctx.organizationId,
        tenantBusinessId: binding.tenant_business_id,
        branchId: binding.branch_id,
      });
      if (
        resolved.bindingId === binding.id
        && resolved.wabaId === binding.provider_account_id
        && resolved.phoneNumberId === binding.provider_destination_id
        && resolved.wabaId
      ) {
        providerContext = {
          accessToken: resolved.accessToken,
          wabaId: resolved.wabaId,
        };
      }
    } catch {
      providerContext = null;
    }

    const { data: disconnected, error: disconnectError } = await service.rpc(
      'disconnect_meta_whatsapp_binding',
      {
        p_organization_id: ctx.organizationId,
        p_binding_id: binding.id,
        p_expected_version: expectedVersion,
        p_actor_user_id: ctx.userId,
        p_request_key: `meta-whatsapp-disconnect:${binding.id}:${expectedVersion}`,
      },
    );

    if (disconnectError) {
      return NextResponse.json({ error: 'WhatsApp binding could not be disconnected safely' }, { status: 409 });
    }

    const disconnectedRow = Array.isArray(disconnected) ? disconnected[0] : disconnected;

    const providerAuditStarted = await auditProviderDisconnect({
      service,
      binding,
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: 'META_WHATSAPP_PROVIDER_UNSUBSCRIBE_STARTED',
      providerUnsubscribeConfirmed: false,
      reason: 'PENDING_PROVIDER_RECONCILIATION',
    });

    if (!providerAuditStarted) {
      return NextResponse.json({
        ok: true,
        localDisconnected: true,
        providerUnsubscribeConfirmed: false,
        reconciliationRequired: true,
        version: disconnectedRow?.version ?? expectedVersion + 1,
        message: 'Smart Visions provider actions are blocked. Provider unsubscribe was not attempted because durable reconciliation evidence could not be started.',
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    let providerUnsubscribeConfirmed = false;
    let reconciliationRequired = false;
    let reconciliationReason: string | null = null;

    if (providerContext) {
      try {
        await unsubscribeMetaWhatsAppBinding({
          graphVersion: metaGraphVersion(),
          accessToken: providerContext.accessToken,
          appId,
          wabaId: providerContext.wabaId,
        });
        providerUnsubscribeConfirmed = true;
      } catch (providerError) {
        reconciliationRequired = true;
        reconciliationReason = providerError instanceof MetaWhatsAppCredentialHealthError
          ? providerError.kind
          : 'UNCONFIRMED';
      }
    } else {
      reconciliationRequired = true;
      reconciliationReason = 'CREDENTIAL_UNAVAILABLE';
    }

    const providerAuditFinalized = await auditProviderDisconnect({
      service,
      binding,
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: providerUnsubscribeConfirmed
        ? 'META_WHATSAPP_PROVIDER_UNSUBSCRIBED'
        : 'META_WHATSAPP_PROVIDER_UNSUBSCRIBE_RECONCILIATION_REQUIRED',
      providerUnsubscribeConfirmed,
      reason: reconciliationReason,
    });

    if (!providerAuditFinalized) {
      reconciliationRequired = true;
      reconciliationReason = reconciliationReason ?? 'AUDIT_FINALIZATION_REQUIRED';
    }

    return NextResponse.json({
      ok: true,
      localDisconnected: true,
      providerUnsubscribeConfirmed,
      reconciliationRequired,
      version: disconnectedRow?.version ?? expectedVersion + 1,
      message: providerUnsubscribeConfirmed
        ? 'WhatsApp API disconnected and Meta webhook subscription removal was confirmed. The mobile WhatsApp Business account was not changed.'
        : 'Smart Visions provider actions are blocked. Meta unsubscribe could not be confirmed and will require explicit reconciliation; no blind provider retry was performed.',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Unable to process WhatsApp lifecycle action safely' }, { status: 500 });
  }
}
