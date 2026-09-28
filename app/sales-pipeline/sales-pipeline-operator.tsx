'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type {
  CrmDealRow,
  CrmPipelineForecastRow,
  CrmPipelineRow,
  CrmPipelineStageRow,
} from '@/lib/crm/deals';

type Business = { id:string; name:string };
type Owner = { userId:string; role:string; businessWide:boolean };
type Team = { id:string; name:string };

const short = (value:string) => value.length > 12 ? value.slice(0,8) + '…' : value;
const numberOrNull = (value:FormDataEntryValue | null) => {
  const text=String(value ?? '').trim();
  if(!text) return null;
  const parsed=Number(text);
  return Number.isFinite(parsed) ? parsed : null;
};
const isoOrNull = (value:FormDataEntryValue | null) => {
  const text=String(value ?? '').trim();
  if(!text) return null;
  const date=new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export function SalesPipelineOperator(props:{
  organizationId:string;
  currentUserId:string;
  currentRole:string;
  canManagePipeline:boolean;
  canManageDeals:boolean;
  canCreateDeals:boolean;
  canReassignOwner?:boolean;
  pipelines:CrmPipelineRow[];
  stages:CrmPipelineStageRow[];
  deals:CrmDealRow[];
  forecast:CrmPipelineForecastRow[];
  businesses:Business[];
  owners:Owner[];
  teams:Team[];
}) {
  const router=useRouter();
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [createPipelineId,setCreatePipelineId]=useState(
    props.pipelines.find(p=>p.is_default && p.status==='ACTIVE')?.id
      ?? props.pipelines.find(p=>p.status==='ACTIVE')?.id
      ?? ''
  );

  const activeStages=useMemo(
    ()=>props.stages.filter(stage=>stage.pipeline_id===createPipelineId && stage.is_active),
    [props.stages,createPipelineId],
  );

  const pipelineName=new Map(props.pipelines.map(p=>[p.id,p.name]));
  const stageById=new Map(props.stages.map(stage=>[stage.id,stage]));
  const teamName=new Map(props.teams.map(team=>[team.id,team.name]));

  async function mutate(path:string,method:'POST'|'PATCH',payload:Record<string,unknown>) {
    setWorking(true);
    setMessage(null);
    try {
      const response=await fetch(path,{
        method,
        headers:{'content-type':'application/json'},
        body:JSON.stringify(payload),
      });
      const body=await response.json() as {error?:string;code?:string};
      if(!response.ok) throw new Error(body.error || body.code || 'CRM mutation failed');
      setMessage('Sales Pipeline updated.');
      router.refresh();
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'CRM mutation failed');
    } finally {
      setWorking(false);
    }
  }

  const forecastCurrencies=new Set(props.forecast.map(row=>row.currency).filter(Boolean));

  return <div className="settingsList">
    <section className="statsGrid fourStats">
      <article><span>Active pipelines</span><strong>{props.pipelines.filter(p=>p.status==='ACTIVE').length}</strong></article>
      <article><span>Open deals</span><strong>{props.deals.filter(d=>d.state==='OPEN').length}</strong></article>
      <article><span>Won deals</span><strong>{props.deals.filter(d=>d.state==='WON').length}</strong></article>
      <article><span>Forecast currencies</span><strong>{forecastCurrencies.size}</strong></article>
    </section>

    {message ? <section className="panel"><strong>Operator result</strong><p className="muted">{message}</p></section> : null}

    <section className="panel">
      <div className="headerRow">
        <div>
          <h2>Forecast</h2>
          <p className="muted">
            Weighted amount is derived from canonical Deal amount and governed effective probability.
            Currencies remain separated.
          </p>
        </div>
      </div>
      {props.forecast.length===0 ? <p className="muted">No visible forecast evidence yet.</p> : (
        <div className="settingsList">
          {props.forecast.map((row,index)=><article className="settingsRow" key={[
            row.pipeline_id,row.owner_user_id,row.team_id,row.currency,row.forecast_category,index,
          ].join(':')}>
            <div>
              <strong>{pipelineName.get(row.pipeline_id) ?? short(row.pipeline_id)} · {row.forecast_category}</strong>
              <span className="muted smallText">
                {row.deal_count} deals · {row.currency ?? 'NO_AMOUNT'} · owner {short(row.owner_user_id)}
                {' · '}team {row.team_id ? (teamName.get(row.team_id) ?? short(row.team_id)) : '—'}
              </span>
              <span className="muted smallText">
                Total {Number(row.amount_total ?? 0).toFixed(2)}
                {' · '}Weighted {Number(row.weighted_amount_total ?? 0).toFixed(2)}
              </span>
            </div>
          </article>)}
        </div>
      )}
    </section>

    <section className="panel">
      <h2>Pipeline definitions</h2>
      {props.canManagePipeline ? <form className="settingsRow" onSubmit={event=>{
        event.preventDefault();
        const form=new FormData(event.currentTarget);
        void mutate('/api/crm/pipelines','POST',{
          organizationId:props.organizationId,
          name:String(form.get('name') ?? '').trim(),
          isDefault:form.get('isDefault')==='on',
          stages:[
            {name:'New',position:1,category:'OPEN',probabilityBps:1000,forecastCategory:'PIPELINE'},
            {name:'Qualified',position:2,category:'OPEN',probabilityBps:3500,forecastCategory:'PIPELINE'},
            {name:'Proposal',position:3,category:'OPEN',probabilityBps:6500,forecastCategory:'BEST_CASE',requireAmount:true},
            {name:'Commit',position:4,category:'OPEN',probabilityBps:8500,forecastCategory:'COMMIT',requireAmount:true,requireExpectedClose:true,allowProbabilityOverride:true},
            {name:'Won',position:5,category:'WON'},
            {name:'Lost',position:6,category:'LOST'},
          ],
        });
        event.currentTarget.reset();
      }}>
        <div><strong>Create governed pipeline</strong><span className="muted smallText">No Deal or synthetic revenue is created.</span></div>
        <label>Name<input name="name" maxLength={160} required/></label>
        <label><input type="checkbox" name="isDefault"/> Default</label>
        <button disabled={working}>Create</button>
      </form> : <p className="muted">Pipeline policy changes require a business-wide OWNER, ADMIN or SALES_MANAGER.</p>}

      <div className="settingsList">
        {props.pipelines.map(pipeline=><article className="panel" key={pipeline.id}>
          <div className="headerRow">
            <div><strong>{pipeline.name}</strong><p className="muted smallText">{pipeline.status} · v{pipeline.version}{pipeline.is_default?' · DEFAULT':''}</p></div>
          </div>
          {props.stages.filter(stage=>stage.pipeline_id===pipeline.id).map(stage=><form
            className="settingsRow"
            key={stage.id}
            onSubmit={event=>{
              event.preventDefault();
              const form=new FormData(event.currentTarget);
              void mutate('/api/crm/pipelines','PATCH',{
                organizationId:props.organizationId,
                entity:'STAGE',
                id:stage.id,
                expectedVersion:stage.version,
                patch:{
                  name:String(form.get('name') ?? '').trim(),
                  position:Number(form.get('position')),
                  is_active:form.get('active')==='on',
                  probability_bps:stage.category==='OPEN' ? Number(form.get('probabilityBps')) : stage.probability_bps,
                  forecast_category:stage.category==='WON'
                    ? 'CLOSED_WON'
                    : stage.category==='LOST'
                      ? 'CLOSED_LOST'
                      : String(form.get('forecastCategory')),
                  require_amount:form.get('requireAmount')==='on',
                  require_expected_close:form.get('requireExpectedClose')==='on',
                  allow_probability_override:stage.category==='OPEN' && form.get('allowOverride')==='on',
                },
              });
            }}
          >
            <div>
              <strong>{stage.category}</strong>
              <span className="muted smallText">v{stage.version} · policy locks while OPEN Deals reference this stage</span>
            </div>
            <label>Name<input name="name" defaultValue={stage.name} maxLength={120} disabled={!props.canManagePipeline}/></label>
            <label>Position<input name="position" type="number" min={1} defaultValue={stage.position} disabled={!props.canManagePipeline}/></label>
            <label>Probability bps<input name="probabilityBps" type="number" min={0} max={10000} defaultValue={stage.probability_bps} disabled={!props.canManagePipeline || stage.category!=='OPEN'}/></label>
            {stage.category==='OPEN' ? <label>Forecast<select name="forecastCategory" defaultValue={stage.forecast_category} disabled={!props.canManagePipeline}>
              <option value="PIPELINE">Pipeline</option>
              <option value="BEST_CASE">Best case</option>
              <option value="COMMIT">Commit</option>
            </select></label> : <span>{stage.forecast_category}</span>}
            <label><input name="requireAmount" type="checkbox" defaultChecked={stage.require_amount} disabled={!props.canManagePipeline}/> Amount required</label>
            <label><input name="requireExpectedClose" type="checkbox" defaultChecked={stage.require_expected_close} disabled={!props.canManagePipeline}/> Close date required</label>
            <label><input name="allowOverride" type="checkbox" defaultChecked={stage.allow_probability_override} disabled={!props.canManagePipeline || stage.category!=='OPEN'}/> Probability override</label>
            <label><input name="active" type="checkbox" defaultChecked={stage.is_active} disabled={!props.canManagePipeline}/> Active</label>
            <button disabled={working || !props.canManagePipeline}>Save stage</button>
          </form>)}
        </article>)}
      </div>
    </section>

    {props.canCreateDeals ? <section className="panel">
      <h2>Create Deal</h2>
      {props.pipelines.some(p=>p.status==='ACTIVE') && props.businesses.length>0 ? <form className="settingsRow" onSubmit={event=>{
        event.preventDefault();
        const form=new FormData(event.currentTarget);
        const amount=numberOrNull(form.get('amount'));
        void mutate('/api/crm/deals','POST',{
          mode:'MANUAL',
          organizationId:props.organizationId,
          businessId:String(form.get('businessId')),
          pipelineId:String(form.get('pipelineId')),
          stageId:String(form.get('stageId')),
          title:String(form.get('title') ?? '').trim(),
          amount,
          currency:amount===null ? null : String(form.get('currency') ?? '').trim().toUpperCase(),
          expectedCloseAt:isoOrNull(form.get('expectedCloseAt')),
          ownerUserId:String(form.get('ownerUserId')),
          teamId:String(form.get('teamId') ?? '') || null,
          probabilityOverrideBps:numberOrNull(form.get('probabilityOverrideBps')),
          requestKey:'sales-pipeline-ui-' + crypto.randomUUID(),
          metadata:{source:'SALES_PIPELINE_OPERATOR'},
        });
      }}>
        <label>Account<select name="businessId" required>{props.businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Pipeline<select name="pipelineId" value={createPipelineId} onChange={event=>setCreatePipelineId(event.target.value)} required>
          <option value="">Choose</option>
          {props.pipelines.filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Stage<select name="stageId" required>{activeStages.filter(s=>s.category==='OPEN').map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Title<input name="title" maxLength={240} required/></label>
        <label>Amount<input name="amount" type="number" min={0} step="0.0001"/></label>
        <label>Currency<input name="currency" maxLength={3} defaultValue="OMR"/></label>
        <label>Expected close<input name="expectedCloseAt" type="datetime-local"/></label>
        <label>Owner<select name="ownerUserId" defaultValue={props.currentUserId}>{props.owners.map(owner=><option key={owner.userId} value={owner.userId}>{owner.role} · {short(owner.userId)}</option>)}</select></label>
        <label>Team<select name="teamId"><option value="">No Team</option>{props.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label>Override bps<input name="probabilityOverrideBps" type="number" min={0} max={10000}/></label>
        <button disabled={working}>Create Deal</button>
      </form> : <p className="muted">Create an active Pipeline and have at least one Account before creating a Deal.</p>}
    </section> : null}

    <section className="panel">
      <h2>Deals</h2>
      {props.deals.length===0 ? <p className="muted">No Deal is visible in your current scope.</p> : (
        <div className="settingsList">
          {props.deals.map(deal=>{
            const currentStage=stageById.get(deal.stage_id);
            const terminal=deal.state!=='OPEN';
            const pipelineStages=props.stages.filter(stage=>stage.pipeline_id===deal.pipeline_id && stage.is_active);
            const effectiveBps=deal.state==='WON' ? 10000 : deal.state==='LOST' ? 0 : (deal.probability_override_bps ?? currentStage?.probability_bps ?? 0);
            const weighted=deal.amount==null ? null : Number(deal.amount)*effectiveBps/10000;
            return <form className="panel" key={deal.id} onSubmit={event=>{
              event.preventDefault();
              const form=new FormData(event.currentTarget);
              const stageId=String(form.get('stageId'));
              const destination=stageById.get(stageId);
              const amount=numberOrNull(form.get('amount'));
              const closeSourceType=String(form.get('closeSourceType') ?? '');
              const closeSourceRef=String(form.get('closeSourceRef') ?? '').trim();
              const closing=destination?.category==='WON' || destination?.category==='LOST';
              void mutate('/api/crm/deals','PATCH',{
                organizationId:props.organizationId,
                dealId:deal.id,
                expectedVersion:deal.version,
                patch:{
                  title:String(form.get('title') ?? '').trim(),
                  stageId,
                  amount,
                  currency:amount===null ? null : String(form.get('currency') ?? '').trim().toUpperCase(),
                  expectedCloseAt:isoOrNull(form.get('expectedCloseAt')),
                  ownerUserId:props.canReassignOwner ? String(form.get('ownerUserId')) : deal.owner_user_id,
                  teamId:String(form.get('teamId') ?? '') || null,
                  probabilityOverrideBps:destination?.allow_probability_override
                    ? numberOrNull(form.get('probabilityOverrideBps'))
                    : null,
                  lostReason:destination?.category==='LOST' ? String(form.get('lostReason') ?? '').trim() || null : null,
                  closeEvidence:closing ? {sourceType:closeSourceType,sourceRef:closeSourceRef} : null,
                },
              });
            }}>
              <div className="headerRow">
                <div>
                  <strong>{deal.title}</strong>
                  <p className="muted smallText">
                    {pipelineName.get(deal.pipeline_id) ?? short(deal.pipeline_id)} · {currentStage?.name ?? short(deal.stage_id)}
                    {' · '}v{deal.version}
                  </p>
                </div>
                <span className="status">{deal.state}</span>
              </div>
              <div className="healthList">
                <span>Probability <strong>{(effectiveBps/100).toFixed(2)}%</strong></span>
                <span>Weighted <strong>{weighted==null?'—':weighted.toFixed(2)+' '+(deal.currency ?? '')}</strong></span>
                <span>Owner <strong>{short(deal.owner_user_id)}</strong></span>
                <span>Team <strong>{deal.team_id ? (teamName.get(deal.team_id) ?? short(deal.team_id)) : '—'}</strong></span>
              </div>
              {!terminal ? <div className="settingsRow">
                <label>Title<input name="title" defaultValue={deal.title} maxLength={240} disabled={!props.canManageDeals}/></label>
                <label>Stage<select name="stageId" defaultValue={deal.stage_id} disabled={!props.canManageDeals}>{pipelineStages.map(stage=><option key={stage.id} value={stage.id}>{stage.name} · {stage.category}</option>)}</select></label>
                <label>Amount<input name="amount" type="number" min={0} step="0.0001" defaultValue={deal.amount ?? ''} disabled={!props.canManageDeals}/></label>
                <label>Currency<input name="currency" maxLength={3} defaultValue={deal.currency ?? 'OMR'} disabled={!props.canManageDeals}/></label>
                <label>Expected close<input name="expectedCloseAt" type="datetime-local" defaultValue={deal.expected_close_at ? deal.expected_close_at.slice(0,16) : ''} disabled={!props.canManageDeals}/></label>
                {props.canReassignOwner ? <label>Owner<select name="ownerUserId" defaultValue={deal.owner_user_id} disabled={!props.canManageDeals}>
                  {props.owners.map(owner=><option key={owner.userId} value={owner.userId}>{owner.role} · {short(owner.userId)}</option>)}
                </select></label> : null}
                <label>Team<select name="teamId" defaultValue={deal.team_id ?? ''} disabled={!props.canManageDeals}>
                  <option value="">No Team</option>{props.teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}
                </select></label>
                <label>Override bps<input name="probabilityOverrideBps" type="number" min={0} max={10000} defaultValue={deal.probability_override_bps ?? ''} disabled={!props.canManageDeals}/></label>
                <label>Lost reason<input name="lostReason" maxLength={2000} disabled={!props.canManageDeals}/></label>
                <label>Close evidence<select name="closeSourceType" defaultValue="OPERATOR_CONFIRMED" disabled={!props.canManageDeals}>
                  <option value="OPERATOR_CONFIRMED">Operator confirmed</option>
                  <option value="CUSTOMER_CONFIRMATION">Customer confirmation</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="CONTRACT">Contract</option>
                  <option value="OTHER">Other</option>
                </select></label>
                <label>Evidence reference<input name="closeSourceRef" maxLength={512} disabled={!props.canManageDeals}/></label>
                <button disabled={working || !props.canManageDeals}>Save Deal</button>
              </div> : <p className="muted">Terminal Deal forecast/team/close evidence is immutable.</p>}
            </form>;
          })}
        </div>
      )}
    </section>
  </div>;
}
