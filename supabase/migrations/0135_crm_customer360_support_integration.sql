-- 0135: Customer 360 support-case integration.
--
-- Extends the existing Person-centric read model with canonical Support Case
-- authority introduced by 0132/0133. No Support mutation semantics are changed:
-- Case Business/Person/Conversation context remains immutable after creation.
-- Internal Notes remain intentionally out of this Organization-wide read model
-- until their scoped-inbox authorization can be preserved without leakage.

create or replace function public.get_crm_customer360_v2(
  p_organization_id uuid,
  p_person_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public, pg_catalog
as $customer360_read$
declare
  v_person public.crm_people%rowtype;
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'CRM Customer 360 limit must be between 1 and 100';
  end if;

  if not public.is_org_member(p_organization_id) then
    raise exception 'CRM Customer 360 read requires Organization membership';
  end if;

  select p.* into v_person
  from public.crm_people p
  where p.organization_id = p_organization_id
    and p.id = p_person_id;

  if not found then
    raise exception 'CRM Customer 360 Person was not found';
  end if;

  select jsonb_build_object(
    'person', jsonb_build_object(
      'id', v_person.id,
      'displayName', v_person.display_name,
      'status', v_person.status,
      'mergedIntoPersonId', v_person.merged_into_person_id,
      'firstSeenAt', v_person.first_seen_at,
      'lastSeenAt', v_person.last_seen_at,
      'createdAt', v_person.created_at,
      'updatedAt', v_person.updated_at
    ),
    'identities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'identityId', q.id,
        'identityType', q.identity_type,
        'displayValue', q.display_value,
        'identityStatus', q.identity_status,
        'linkStatus', q.link_status,
        'verificationMethod', q.verification_method,
        'sourceRef', q.source_ref,
        'firstSeenAt', q.first_seen_at,
        'lastSeenAt', q.last_seen_at
      ) order by q.last_seen_at desc, q.id)
      from (
        select
          i.id,
          i.identity_type,
          i.display_value,
          i.status as identity_status,
          l.status as link_status,
          l.verification_method,
          l.source_ref,
          l.first_seen_at,
          l.last_seen_at
        from public.crm_person_identity_links l
        join public.crm_identities i
          on i.organization_id = l.organization_id
         and i.id = l.identity_id
        where l.organization_id = p_organization_id
          and l.person_id = p_person_id
          and l.status <> 'RETIRED'
        order by l.last_seen_at desc, i.id
        limit p_limit
      ) q
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationshipId', q.id,
        'businessId', q.business_id,
        'businessName', q.business_name,
        'countryCode', q.country_code,
        'city', q.city,
        'category', q.category,
        'relationshipType', q.relationship_type,
        'jobTitle', q.job_title,
        'verificationMethod', q.verification_method,
        'status', q.status,
        'firstSeenAt', q.first_seen_at,
        'lastSeenAt', q.last_seen_at
      ) order by q.last_seen_at desc, q.id)
      from (
        select
          r.id,
          r.business_id,
          b.name as business_name,
          b.country_code,
          to_jsonb(b) ->> 'city' as city,
          to_jsonb(b) ->> 'category' as category,
          r.relationship_type,
          r.job_title,
          r.verification_method,
          r.status,
          r.first_seen_at,
          r.last_seen_at
        from public.crm_person_business_relationships r
        join public.businesses b
          on b.organization_id = r.organization_id
         and b.id = r.business_id
        where r.organization_id = p_organization_id
          and r.person_id = p_person_id
        order by r.last_seen_at desc, r.id
        limit p_limit
      ) q
    ), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'businessId', l.business_id,
        'status', l.status,
        'opportunityScore', l.opportunity_score,
        'intentScore', l.intent_score,
        'agentMode', l.agent_mode,
        'recommendedOffer', to_jsonb(l) ->> 'recommended_offer',
        'personLinkMethod', l.person_link_method,
        'personLinkSourceRef', l.person_link_source_ref,
        'personLinkedAt', l.person_linked_at,
        'updatedAt', l.updated_at
      ) order by l.updated_at desc, l.id)
      from (
        select *
        from public.leads
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) l
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'leadId', c.lead_id,
        'channel', c.channel,
        'stage', c.stage,
        'agentMode', c.agent_mode,
        'summary', c.summary,
        'lastMessageAt', c.last_message_at,
        'requiresHuman', c.requires_human,
        'detectedLanguage', c.detected_language,
        'detectedDialect', c.detected_dialect,
        'intentLabel', c.intent_label,
        'sentimentLabel', c.sentiment_label,
        'personLinkMethod', c.person_link_method,
        'personLinkSourceRef', c.person_link_source_ref,
        'personLinkedAt', c.person_linked_at,
        'updatedAt', c.updated_at
      ) order by c.updated_at desc, c.id)
      from (
        select *
        from public.sales_conversations
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) c
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'businessId', t.business_id,
        'leadId', t.lead_id,
        'conversationId', t.conversation_id,
        'taskType', t.task_type,
        'title', t.title,
        'status', t.status,
        'priority', t.priority,
        'assigneeUserId', t.assignee_user_id,
        'dueAt', t.due_at,
        'personLinkMethod', t.person_link_method,
        'personLinkSourceRef', t.person_link_source_ref,
        'personLinkedAt', t.person_linked_at,
        'updatedAt', t.updated_at
      ) order by t.updated_at desc, t.id)
      from (
        select *
        from public.crm_tasks
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) t
    ), '[]'::jsonb),
    'deals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'businessId', d.business_id,
        'leadId', d.lead_id,
        'pipelineId', d.pipeline_id,
        'stageId', d.stage_id,
        'title', d.title,
        'state', d.state,
        'amount', d.amount,
        'currency', d.currency,
        'expectedCloseAt', d.expected_close_at,
        'ownerUserId', d.owner_user_id,
        'personLinkMethod', d.person_link_method,
        'personLinkSourceRef', d.person_link_source_ref,
        'personLinkedAt', d.person_linked_at,
        'updatedAt', d.updated_at
      ) order by d.updated_at desc, d.id)
      from (
        select *
        from public.crm_deals
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) d
    ), '[]'::jsonb),
    'supportCases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'businessId', s.business_id,
        'conversationId', s.conversation_id,
        'subject', s.subject,
        'status', s.status,
        'priority', s.priority,
        'assigneeUserId', s.assignee_user_id,
        'slaPolicyId', s.sla_policy_id,
        'firstResponseDueAt', s.first_response_due_at,
        'resolutionDueAt', s.resolution_due_at,
        'firstRespondedAt', s.first_responded_at,
        'escalationLevel', s.escalation_level,
        'resolvedAt', s.resolved_at,
        'closedAt', s.closed_at,
        'csatScore', s.csat_score,
        'version', s.version,
        'updatedAt', s.updated_at,
        'createdAt', s.created_at
      ) order by s.updated_at desc, s.id)
      from (
        select *
        from public.crm_support_cases
        where organization_id = p_organization_id
          and person_id = p_person_id
        order by updated_at desc, id
        limit p_limit
      ) s
    ), '[]'::jsonb),
    'activityTimeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'itemId', x.item_id,
        'businessId', x.business_id,
        'leadId', x.lead_id,
        'conversationId', x.conversation_id,
        'source', x.source,
        'kind', x.kind,
        'visibility', x.visibility,
        'channel', x.channel,
        'direction', x.direction,
        'status', x.status,
        'deliveryStatus', x.delivery_status,
        'occurredAt', x.occurred_at,
        'title', x.title,
        'summary', x.summary
      ) order by x.occurred_at desc, x.item_id desc)
      from (
        select t.*
        from public.crm_customer_timeline t
        where t.organization_id = p_organization_id
          and (
            exists (
              select 1 from public.leads l
              where l.organization_id = p_organization_id
                and l.id = t.lead_id
                and l.person_id = p_person_id
            )
            or exists (
              select 1 from public.sales_conversations c
              where c.organization_id = p_organization_id
                and c.id = t.conversation_id
                and c.person_id = p_person_id
            )
          )
        order by t.occurred_at desc, t.item_id desc
        limit p_limit
      ) x
    ), '[]'::jsonb),
    'linkCandidates', jsonb_build_object(
      'leads', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'LEAD',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', coalesce(q.business_name, q.id::text),
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select l.id, l.business_id, b.name as business_name, l.updated_at
          from public.leads l
          left join public.businesses b
            on b.organization_id = l.organization_id
           and b.id = l.business_id
          where l.organization_id = p_organization_id
            and l.person_id is null
            and l.business_id is not null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = l.business_id
                and r.status = 'ACTIVE'
            )
          order by l.updated_at desc, l.id
          limit p_limit
        ) q
      ), '[]'::jsonb),
      'conversations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'CONVERSATION',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', q.channel || ' · ' || q.id::text,
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select c.id, l.business_id, c.channel, c.updated_at
          from public.sales_conversations c
          join public.leads l
            on l.organization_id = c.organization_id
           and l.id = c.lead_id
          where c.organization_id = p_organization_id
            and c.person_id is null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = l.business_id
                and r.status = 'ACTIVE'
            )
          order by c.updated_at desc, c.id
          limit p_limit
        ) q
      ), '[]'::jsonb),
      'tasks', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'TASK',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', q.title,
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select
            t.id,
            coalesce(t.business_id, l.business_id, cl.business_id) as business_id,
            t.title,
            t.updated_at
          from public.crm_tasks t
          left join public.leads l
            on l.organization_id = t.organization_id
           and l.id = t.lead_id
          left join public.sales_conversations c
            on c.organization_id = t.organization_id
           and c.id = t.conversation_id
          left join public.leads cl
            on cl.organization_id = c.organization_id
           and cl.id = c.lead_id
          where t.organization_id = p_organization_id
            and t.person_id is null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = coalesce(t.business_id, l.business_id, cl.business_id)
                and r.status = 'ACTIVE'
            )
          order by t.updated_at desc, t.id
          limit p_limit
        ) q
      ), '[]'::jsonb),
      'deals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'entityType', 'DEAL',
          'entityId', q.id,
          'businessId', q.business_id,
          'label', q.title,
          'updatedAt', q.updated_at
        ) order by q.updated_at desc, q.id)
        from (
          select d.id, d.business_id, d.title, d.updated_at
          from public.crm_deals d
          where d.organization_id = p_organization_id
            and d.person_id is null
            and exists (
              select 1
              from public.crm_person_business_relationships r
              where r.organization_id = p_organization_id
                and r.person_id = p_person_id
                and r.business_id = d.business_id
                and r.status = 'ACTIVE'
            )
          order by d.updated_at desc, d.id
          limit p_limit
        ) q
      ), '[]'::jsonb)
    ),
    'moduleStatus', jsonb_build_object(
      'conversations', 'IMPLEMENTED',
      'tasks', 'IMPLEMENTED',
      'deals', 'IMPLEMENTED',
      'notes', 'CANONICAL_LINK_PENDING',
      'bookings', 'MODULE_NOT_IMPLEMENTED',
      'quotes', 'MODULE_NOT_IMPLEMENTED',
      'orders', 'MODULE_NOT_IMPLEMENTED',
      'invoices', 'MODULE_NOT_IMPLEMENTED',
      'payments', 'MODULE_NOT_IMPLEMENTED',
      'supportCases', 'IMPLEMENTED',
      'documents', 'MODULE_NOT_IMPLEMENTED',
      'consent', 'MODULE_NOT_IMPLEMENTED'
    )
  )
  into v_result;

  return v_result;
end;
$customer360_read$;

revoke all on function public.get_crm_customer360_v2(uuid, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_crm_customer360_v2(uuid, uuid, integer)
  to authenticated;

comment on function public.get_crm_customer360_v2(uuid, uuid, integer) is
  'Person-centric Customer 360 read model over canonical direct Person links, now including Support Cases. Missing modules remain explicit; private scoped Notes are not widened into Organization-level visibility.';
