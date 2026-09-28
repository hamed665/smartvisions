'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type {
  CrmDealRow,
  CrmForecastCategory,
  CrmPipelineForecastRow,
  CrmPipelineRow,
  CrmPipelineStageRow,
} from '@/lib/crm/deals';

type Business = { id:string; name:string };
type Member = { userId:string; role:string };
type Team = { id:string; name:string };
type TeamAssignment = { userId:string; teamId:string; role:string };

const OPEN_FORECASTS: CrmForecastCategory[] = ['PIPELINE','BEST_CASE','COMMIT','OMITTED'];

export function SalesPipelineActions(props: {
  organizationId:string;
  currentUserId:string;
  currentRole:string;
  canManagePipeline:boolean;
  canManageDeals:boolean;
  pipelines:CrmPipelineRow[];
  stages:CrmPipelineStageRow[];
  deals:CrmDealRow[];
  forecast:CrmPipelineForecastRow[];
  businesses:Business[];
  members:Member[];
  teams:Team[];
  teamAssignments:TeamAssignment[];
}) {
  const router=useRouter();
  const [working,setWorking]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const [createPipelineId,setCreatePipelineId]=useState(
    props.pipelines.find(p=>p.is_default)?.id ?? props.pipelines.find(p=>p.status==='ACTIVE')?.id ?? ''
  );
  const [createOwnerId,setCreateOwnerId]=useState(props.currentUserId);

  const activeStages=useMemo(
    ()=>props.stages.filter(s=>s.pipeline_id===createPipelineId && s.is_active),
    [props.stages,createPipelineId],
  );
  const createTeams=useMemo(
    ()=>props.teams.filter(team=>props.teamAssignments.some(a=>a.userId===createOwnerId && a.teamId===team.id)),
    [props.teams,props.teamAssignments,createOwnerId],
  );
  const ownerChoices=props.currentRole==='SALES_AGENT'
    ? props.members.filter(m=>m.userId===props.currentUserId)
    : props.members;

  const currencyTotals=useMemo(()=>{
    const totals=new Map<string,{count:number;amount:number;weighted:number}>();
    for(const row of props.forecast){
      const key=row.currency ?? 'NO_AMOUNT';
      const item=totals.get(key) ?? {count:0,amount:0,weighted:0};
      item.count+=Number(row.deal_count ?? 0);
      item.amount+=Number(row.total_amount ?? 0);
      item.weighted+=Number(row.weighted_amount ?? 0);
      totals.set(key,item);
    }
    return [...totals.entries()];
  },[props.forecast]);

  async function json(path:string,method:'POST'|'PATCH',payload:Record<string,unknown>){
    setWorking(true);setMessage(null);
    try{
      const response=await fetch(path,{
        method,headers:{'content-type':'application/json'},body:JSON.stringify(payload),
      });
      const body=await response.json() as {error?:string;code?:string};
      if(!response.ok) throw new Error(body.error || body.code || 'CRM mutation failed');
      setMessage('Sales pipeline state updated.');
      router.refresh();
    }catch(error){
      setMessage(error instanceof Error?error.message:'CRM mutation failed');
    }finally{setWorking(false);}
  }

  return <div className="settingsList">
    <section className="statsGrid fourStats">
      <article><span>Active pipelines</span><strong>{props.pipelines.filter(p=>p.status==='ACTIVE').length}</strong></article>
      <article><span>Open deals</span><strong>{props.deals.filter(d=>d.state==='OPEN').length}</strong></article>
      <article><span>Won deals</span><strong>{props.deals.filter(d=>d.state==='WON').length}</strong></article>
      <article><span>Forecast currencies</span><strong>{currencyTotals.filter(([currency])=>currency!=='NO_AMOUNT').length}</strong></article>
    </section>

    <section className="panel">
      <h2>Forecast summary</h2>
      {currencyTotals.length===0?<p className="muted">No open Deal forecast evidence yet.</p>:null}
      <div className="healthList">
        {currencyTotals.map(([currency,total])=><span key={currency}>
          {currency}<strong>{total.count} deals · total {total.amount.toFixed(2)} · weighted {total.weighted.toFixed(2)}</strong>
        </span>)}
      </div>
      <div className="settingsList">
        {props.forecast.map((row,index)=><article className="settingsRow" key={[
          row.pipeline_id,row.stage_id,row.forecast_category,row.currency,row.owner_user_id,row.owner_team_id,index,
        ].join(':')}>
          <div>
            <strong>{row.pipeline_name} · {row.stage_name}</strong>
            <span className="muted smallText">
              {row.forecast_category} · {row.currency ?? 'NO_AMOUNT'} · {row.deal_count} deals
            </span>
            <span className="muted smallText">
              Total {Number(row.total_amount ?? 0).toFixed(2)} · Weighted {Number(row.weighted_amount ?? 0).toFixed(2)}
            </span>
            <span className="muted smallText">
              Owner {row.owner_user_id} · Team {row.owner_team_id ?? '—'}
            </span>
          </div>
        </article>)}
      </div>
    </section>

    <section className="panel">
      <h2>Pipeline definitions</h2>
      {props.canManagePipeline?<form className="settingsRow" onSubmit={event=>{
        event.preventDefault();
        const form=new FormData(event.currentTarget);
        const name=String(form.get('name')||'').trim();
        void json('/api/crm/pipelines','POST',{
          organizationId:props.organizationId,
          name,
          isDefault:form.get('isDefault')==='on',
          stages:[
            {name:'New',position:1,category:'OPEN',defaultProbabilityPercent:10,forecastCategory:'PIPELINE'},
            {name:'Qualified',position:2,category:'OPEN',defaultProbabilityPercent:30,forecastCategory:'PIPELINE'},
            {name:'Proposal',position:3,category:'OPEN',defaultProbabilityPercent:60,forecastCategory:'BEST_CASE',requiresAmount:true,requiresExpectedClose:true},
            {name:'Commit',position:4,category:'OPEN',defaultProbabilityPercent:85,forecastCategory:'COMMIT',requiresAmount:true,requiresExpectedClose:true},
            {name:'Won',position:5,category:'WON',defaultProbabilityPercent:100,forecastCategory:'CLOSED'},
            {name:'Lost',position:6,category:'LOST',defaultProbabilityPercent:0,forecastCategory:'OMITTED'},
          ],
        });
        event.currentTarget.reset();
      }}>
        <div><strong>Create governed pipeline</strong><span className="muted smallText">Starts with a safe editable six-stage policy. No Deal is created.</span></div>
        <label>Name<input name="name" required maxLength={160}/></label>
        <label><input name="isDefault" type="checkbox"/> Default pipeline</label>
        <button disabled={working}>Create pipeline</button>
      </form>:<p className="muted">Pipeline definition changes require OWNER, ADMIN or SALES_MANAGER.</p>}

      <div className="settingsList">
        {props.pipelines.map(pipeline=><article className="panel" key={pipeline.id}>
          <div className="headerRow">
            <div>
              <strong>{pipeline.name}</strong>
              <p className="muted smallText">{pipeline.status} · v{pipeline.version} {pipeline.is_default?'· DEFAULT':''}</p>
            </div>
          </div>
          {props.stages.filter(stage=>stage.pipeline_id===pipeline.id).map(stage=><form
            className="settingsRow"
            key={stage.id}
            onSubmit={event=>{
              event.preventDefault();
              const form=new FormData(event.currentTarget);
              void json('/api/crm/pipelines','PATCH',{
                organizationId:props.organizationId,
                entity:'STAGE',
                id:stage.id,
                expectedVersion:stage.version,
                patch:{
                  name:String(form.get('name')||''),
                  position:Number(form.get('position')),
                  is_active:form.get('isActive')==='on',
                  defaultProbabilityPercent:stage.category==='OPEN'
                    ? Number(form.get('probability'))
                    : stage.default_probability_percent,
                  forecastCategory:String(form.get('forecastCategory')||stage.forecast_category),
                  requiresAmount:form.get('requiresAmount')==='on',
                  requiresExpectedClose:form.get('requiresExpectedClose')==='on',
                },
              });
            }}
          >
            <div>
              <strong>{stage.category}</strong>
              <span className="muted smallText">v{stage.version} · policy is blocked from changing while this active stage has OPEN deals.</span>
            </div>
            <label>Name<input name="name" defaultValue={stage.name} maxLength={120} disabled={!props.canManagePipeline}/></label>
            <label>Position<input name="position" type="number" min={1} defaultValue={stage.position} disabled={!props.canManagePipeline}/></label>
            <label>Probability<input name="probability" type="number" min={0} max={100} defaultValue={stage.default_probability_percent} disabled={!props.canManagePipeline || stage.category!=='OPEN'}/></label>
            <label>Forecast<select name="forecastCategory" defaultValue={stage.forecast_category} disabled={!props.canManagePipeline || stage.category!=='OPEN'}>
              {(stage.category==='OPEN'?OPEN_FORECASTS:[stage.forecast_category]).map(value=><option key={value} value={value}>{value}</option>)}
            </select></label>
            <label><input name="requiresAmount" type="checkbox" defaultChecked={stage.requires_amount} disabled={!props.canManagePipeline}/> Require amount</label>
            <label><input name="requiresExpectedClose" type="checkbox" defaultChecked={stage.requires_expected_close} disabled={!props.canManagePipeline}/> Require close date</label>
            <label><input name="isActive" type="checkbox" defaultChecked={stage.is_active} disabled={!props.canManagePipeline}/> Active</label>
            {props.canManagePipeline?<button disabled={working}>Update stage</button>:null}
          </form>)}
        </article>)}
      </div>
    </section>

    <section className="panel">
      <h2>Create Deal</h2>
      {!props.canManageDeals?<p className="muted">Read-only access.</p>:null}
      {props.canManageDeals && props.pipelines.some(p=>p.status==='ACTIVE')?<form className="settingsRow" onSubmit={event=>{
        event.preventDefault();
        const form=new FormData(event.currentTarget);
        const dealRequest=crypto.randomUUID();
        const probability=String(form.get('probability')||'').trim();
        const forecast=String(form.get('forecastCategory')||'').trim();
        void json('/api/crm/deals','POST',{
          mode:'MANUAL',
          organizationId:props.organizationId,
          businessId:String(form.get('businessId')||''),
          leadId:null,
          pipelineId:String(form.get('pipelineId')||''),
          stageId:String(form.get('stageId')||''),
          title:String(form.get('title')||''),
          amount:String(form.get('amount')||'').trim()===''?null:Number(form.get('amount')),
          currency:String(form.get('amount')||'').trim()===''?null:String(form.get('currency')||'OMR'),
          expectedCloseAt:String(form.get('expectedCloseAt')||'').trim()===''?null:new Date(String(form.get('expectedCloseAt'))).toISOString(),
          ownerUserId:String(form.get('ownerUserId')||''),
          ownerTeamId:String(form.get('ownerTeamId')||'')||null,
          probabilityPercent:probability===''?null:Number(probability),
          forecastCategory:forecast===''?null:forecast,
          lostReason:null,
          requestKey:`sales-pipeline-ui:${dealRequest}`,
          metadata:{source:'SALES_PIPELINE_UI'},
        });
      }}>
        <label className="wideField">Title<input name="title" required maxLength={240}/></label>
        <label>Account<select name="businessId" required defaultValue=""><option value="" disabled>Select</option>{props.businesses.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Pipeline<select name="pipelineId" value={createPipelineId} onChange={event=>setCreatePipelineId(event.target.value)} required>
          {props.pipelines.filter(p=>p.status==='ACTIVE').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Stage<select key={createPipelineId} name="stageId" required defaultValue={activeStages.find(s=>s.category==='OPEN')?.id ?? ''}>
          {activeStages.map(s=><option key={s.id} value={s.id}>{s.name} · {s.default_probability_percent}%</option>)}
        </select></label>
        <label>Amount<input name="amount" type="number" min={0} step="0.0001"/></label>
        <label>Currency<input name="currency" defaultValue="OMR" maxLength={3}/></label>
        <label>Expected close<input name="expectedCloseAt" type="datetime-local"/></label>
        <label>Owner<select name="ownerUserId" value={createOwnerId} onChange={event=>setCreateOwnerId(event.target.value)}>
          {ownerChoices.map(m=><option key={m.userId} value={m.userId}>{m.role} · {m.userId}</option>)}
        </select></label>
        <label>Owner team<select name="ownerTeamId" defaultValue=""><option value="">None</option>{createTeams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Manual probability<input name="probability" type="number" min={0} max={99} placeholder="Stage default"/></label>
        <label>Manual forecast<select name="forecastCategory" defaultValue=""><option value="">Stage default</option>{OPEN_FORECASTS.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
        <button disabled={working}>Create Deal</button>
      </form>:null}
    </section>

    <section className="panel">
      <h2>Deals</h2>
      {props.deals.length===0?<p className="muted">No canonical Deals yet.</p>:null}
      <div className="settingsList">
        {props.deals.map(deal=>{
          const terminal=deal.state!=='OPEN';
          const pipelineStages=props.stages.filter(s=>s.pipeline_id===deal.pipeline_id && s.is_active);
          return <form className="settingsRow" key={deal.id} onSubmit={event=>{
            event.preventDefault();
            const form=new FormData(event.currentTarget);
            const amount=String(form.get('amount')||'').trim();
            const close=String(form.get('expectedCloseAt')||'').trim();
            void json('/api/crm/deals','PATCH',{
              organizationId:props.organizationId,
              dealId:deal.id,
              expectedVersion:deal.version,
              patch:{
                title:String(form.get('title')||deal.title),
                stageId:String(form.get('stageId')||deal.stage_id),
                amount:amount===''?null:Number(amount),
                currency:amount===''?null:String(form.get('currency')||deal.currency||'OMR'),
                expectedCloseAt:close===''?null:new Date(close).toISOString(),
                ownerUserId:String(form.get('ownerUserId')||deal.owner_user_id),
                ownerTeamId:String(form.get('ownerTeamId')||'')||null,
                probabilityPercent:Number(form.get('probability')),
                forecastCategory:String(form.get('forecastCategory')||deal.forecast_category),
                lostReason:String(form.get('lostReason')||'')||null,
              },
            });
          }}>
            <div>
              <strong>{deal.title}</strong>
              <span className="muted smallText">{deal.state} · v{deal.version} · {deal.probability_percent}% {deal.forecast_category} ({deal.forecast_source})</span>
              <span className="muted smallText">Amount {deal.amount ?? '—'} {deal.currency ?? ''} · weighted {deal.weighted_amount ?? '—'} · Team {deal.owner_team_id ?? '—'}</span>
            </div>
            <label>Title<input name="title" defaultValue={deal.title} disabled={terminal || !props.canManageDeals}/></label>
            <label>Stage<select name="stageId" defaultValue={deal.stage_id} disabled={terminal || !props.canManageDeals}>
              {pipelineStages.map(s=><option key={s.id} value={s.id}>{s.name} · {s.category}</option>)}
            </select></label>
            <label>Amount<input name="amount" type="number" step="0.0001" min={0} defaultValue={deal.amount ?? ''} disabled={terminal || !props.canManageDeals}/></label>
            <label>Currency<input name="currency" maxLength={3} defaultValue={deal.currency ?? 'OMR'} disabled={terminal || !props.canManageDeals}/></label>
            <label>Expected close<input name="expectedCloseAt" type="datetime-local" defaultValue={deal.expected_close_at?deal.expected_close_at.slice(0,16):''} disabled={terminal || !props.canManageDeals}/></label>
            <label>Owner<select name="ownerUserId" defaultValue={deal.owner_user_id} disabled={terminal || !props.canManageDeals}>
              {ownerChoices.map(m=><option key={m.userId} value={m.userId}>{m.role} · {m.userId}</option>)}
            </select></label>
            <label>Owner team<select name="ownerTeamId" defaultValue={deal.owner_team_id ?? ''} disabled={terminal || !props.canManageDeals}>
              <option value="">None</option>{props.teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
            </select></label>
            <label>Probability<input name="probability" type="number" min={0} max={99} defaultValue={deal.probability_percent} disabled={terminal || !props.canManageDeals}/></label>
            <label>Forecast<select name="forecastCategory" defaultValue={deal.forecast_category} disabled={terminal || !props.canManageDeals}>
              {OPEN_FORECASTS.map(value=><option key={value} value={value}>{value}</option>)}
            </select></label>
            <label className="wideField">Lost reason<input name="lostReason" maxLength={2000} defaultValue={deal.lost_reason ?? ''} disabled={terminal || !props.canManageDeals}/></label>
            {!terminal && props.canManageDeals?<button disabled={working}>Update Deal</button>:null}
          </form>;
        })}
      </div>
    </section>

    {message?<p role="status" className="muted">{message}</p>:null}
  </div>;
}
