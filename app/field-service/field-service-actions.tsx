'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Row=Record<string,unknown>;

export function FieldServiceActions(props:{
  organizationId:string;
  currentUserId:string;
  currentRole:string;
  businesses:Row[];
  people:Row[];
  bookings:Row[];
  members:Row[];
  supportCases:Row[];
  workOrders:Row[];
}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);

  async function json(path:string,method:'POST'|'PATCH',body:Record<string,unknown>){
    const response=await fetch(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json() as {error?:string;[key:string]:unknown};
    if(!response.ok) throw new Error(payload.error||'Field Service action failed');
    return payload;
  }

  async function act(fn:()=>Promise<void>){
    setBusy(true); setMessage(null);
    try{ await fn(); setMessage('Field Service updated.'); router.refresh(); }
    catch(error){ setMessage(error instanceof Error?error.message:'Field Service action failed'); }
    finally{ setBusy(false); }
  }

  const assignable=props.currentRole==='SALES_AGENT'
    ?props.members.filter(m=>String(m.user_id)===props.currentUserId):props.members;

  return <div>
    <section className="panel">
      <h2>Create work order</h2>
      <form className="settingsList" onSubmit={event=>void act(async()=>{
        event.preventDefault();
        const form=event.currentTarget;
        const data=new FormData(form);
        const address=String(data.get('formattedAddress')||'').trim();
        const checklist=String(data.get('checklist')||'').split('\n').map(x=>x.trim()).filter(Boolean).map(label=>({label,required:true}));
        await json('/api/field-service','POST',{
          title:String(data.get('title')||''),
          priority:String(data.get('priority')||'NORMAL'),
          businessId:String(data.get('businessId')||'')||null,
          personId:String(data.get('personId')||'')||null,
          bookingId:String(data.get('bookingId')||'')||null,
          supportCaseId:String(data.get('supportCaseId')||'')||null,
          assigneeUserId:String(data.get('assigneeUserId')||'')||null,
          locationSource:String(data.get('locationSource')||'CUSTOMER_CONFIRMED'),
          locationReference:'field-service-ui',
          locationSnapshot:address?{formattedAddress:address,source:'USER_CONFIRMED'}:{},
          requiresCustomerSignoff:data.get('requiresCustomerSignoff')==='on',
          requestKey:crypto.randomUUID(),
          checklist,
        });
        form.reset();
      })}>
        <div className="settingsRow">
          <label className="wideField">Title<input name="title" required maxLength={240}/></label>
          <label>Customer<select name="personId"><option value="">None</option>{props.people.map(p=><option key={String(p.id)} value={String(p.id)}>{String(p.display_name||p.id)}</option>)}</select></label>
          <label>Business<select name="businessId"><option value="">None</option>{props.businesses.map(b=><option key={String(b.id)} value={String(b.id)}>{String(b.name)}</option>)}</select></label>
          <label>Booking<select name="bookingId"><option value="">Unscheduled</option>{props.bookings.map(b=><option key={String(b.id)} value={String(b.id)}>{String(b.booking_reference)} · {String(b.status)}</option>)}</select></label>
          <label>Support case<select name="supportCaseId"><option value="">None</option>{props.supportCases.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.subject)} · {String(c.status)}</option>)}</select></label>
          <label>Technician<select name="assigneeUserId" defaultValue={props.currentUserId}><option value="">Unassigned</option>{assignable.map(m=><option key={String(m.user_id)} value={String(m.user_id)}>{String(m.role)} · {String(m.user_id).slice(0,8)}</option>)}</select></label>
          <label>Priority<select name="priority" defaultValue="NORMAL"><option>LOW</option><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
          <label>Location source<select name="locationSource" defaultValue="CUSTOMER_CONFIRMED"><option>CUSTOMER_CONFIRMED</option><option>MANUAL_CONFIRMED</option><option>BUSINESS_ADDRESS</option><option>BOOKING_BRANCH</option><option>REMOTE</option></select></label>
          <label className="wideField">Confirmed address<input name="formattedAddress" maxLength={1000}/></label>
          <label className="wideField">Checklist<textarea name="checklist" rows={4} placeholder={'One required item per line'}/></label>
          <label><input type="checkbox" name="requiresCustomerSignoff" defaultChecked/> Customer sign-off required</label>
          <button disabled={busy}>Create work order</button>
        </div>
      </form>
    </section>

    <section className="panel">
      <h2>Operational work</h2>
      <div className="settingsList">
        {props.workOrders.length===0?<p className="muted">No Field Service work orders yet.</p>:props.workOrders.map(view=>{
          const task=view.task as Row;
          const order=view.order as Row;
          const checklist=(view.checklist??[]) as Row[];
          const materials=(view.materials??[]) as Row[];
          const evidence=(view.evidence??[]) as Row[];
          const signoff=view.signoff as Row|null;
          const taskId=String(task.id);
          const done=String(task.status)==='DONE';
          return <div className="panel" key={taskId}>
            <div className="headerRow">
              <div>
                <strong>{String(task.title)}</strong>
                <span className="muted smallText">{String(task.priority)} · {String(task.status)} · technician {task.assignee_user_id?String(task.assignee_user_id).slice(0,8):'unassigned'}</span>
                {task.due_at?<span className="muted smallText">Schedule {new Date(String(task.due_at)).toLocaleString()}</span>:<span className="muted smallText">Unscheduled</span>}
                <span className="muted smallText">Location {String(order.location_source)}{(order.location_snapshot as Row)?.formattedAddress?` · ${String((order.location_snapshot as Row).formattedAddress)}`:''}</span>
              </div>
              <span className="status">{checklist.filter(i=>i.completed_at).length}/{checklist.length} checklist</span>
            </div>

            <div className="settingsList">
              {checklist.map(item=><div className="settingsRow" key={String(item.id)}>
                <span>{item.required?'Required':'Optional'} · {String(item.label)}</span>
                <button disabled={busy||done} onClick={()=>void act(async()=>{
                  await json(`/api/field-service/${taskId}`,'PATCH',{
                    action:'SET_CHECKLIST',itemId:item.id,completed:!item.completed_at,
                  });
                })}>{item.completed_at?'Undo':'Complete'}</button>
              </div>)}
              {!done?<form className="settingsRow" onSubmit={event=>void act(async()=>{
                event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
                await json(`/api/field-service/${taskId}`,'PATCH',{action:'ADD_CHECKLIST',label:String(data.get('label')||''),required:true}); form.reset();
              })}><input name="label" placeholder="New checklist item" required maxLength={500}/><button disabled={busy}>Add</button></form>:null}
            </div>

            <form className="settingsRow" onSubmit={event=>void act(async()=>{
              event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
              await json(`/api/field-service/${taskId}`,'PATCH',{
                action:'ADD_MATERIAL',materialName:String(data.get('materialName')||''),
                quantity:Number(data.get('quantity')),unit:String(data.get('unit')||'pcs'),
              }); form.reset();
            })}>
              <input name="materialName" placeholder="Part / material used" required maxLength={240}/>
              <input name="quantity" type="number" min="0.0001" step="0.0001" defaultValue="1" required/>
              <input name="unit" defaultValue="pcs" maxLength={40} required/>
              <button disabled={busy||done}>Record material</button>
            </form>
            {materials.length?<p className="muted smallText">{materials.map(m=>`${String(m.material_name)} × ${String(m.quantity)} ${String(m.unit)}`).join(' · ')}</p>:null}

            <form className="settingsRow" onSubmit={event=>void act(async()=>{
              event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); const file=data.get('file');
              if(!(file instanceof File)||file.size===0) throw new Error('Choose an evidence file');
              const evidenceType=String(data.get('evidenceType')||'PHOTO');
              const prep=await json(`/api/field-service/${taskId}/evidence/upload-url`,'POST',{
                filename:file.name,contentType:file.type,sizeBytes:file.size,evidenceType,
              });
              const supabase=createClient();
              const {error}=await supabase.storage.from('field-service-evidence').uploadToSignedUrl(String(prep.path),String(prep.token),file,{contentType:file.type});
              if(error) throw new Error(error.message);
              await json(`/api/field-service/${taskId}/evidence/finalize`,'POST',{
                evidenceId:prep.evidenceId,path:prep.path,filename:file.name,contentType:file.type,
                sizeBytes:file.size,evidenceType,caption:String(data.get('caption')||'')||null,
              }); form.reset();
            })}>
              <select name="evidenceType" defaultValue="PHOTO"><option>PHOTO</option><option>DOCUMENT</option><option>SIGNATURE</option></select>
              <input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" required/>
              <input name="caption" placeholder="Evidence caption" maxLength={1000}/>
              <button disabled={busy||done}>Upload evidence</button>
            </form>
            {evidence.length?<div className="settingsRow">{evidence.map(e=><a key={String(e.id)} href={`/api/field-service/${taskId}/evidence/${String(e.id)}`} target="_blank" rel="noreferrer">{String(e.evidence_type)} · {String(e.filename)}</a>)}</div>:null}

            <form className="settingsRow" onSubmit={event=>void act(async()=>{
              event.preventDefault(); const data=new FormData(event.currentTarget);
              await json(`/api/field-service/${taskId}`,'PATCH',{action:'SET_WORK_ORDER',completionSummary:String(data.get('summary')||'')});
            })}>
              <textarea name="summary" defaultValue={String(order.completion_summary??'')} placeholder="Completion summary" rows={3} maxLength={4000}/>
              <button disabled={busy||done}>Save completion summary</button>
            </form>

            {!signoff&&order.requires_customer_signoff&&!done?<form className="settingsRow" onSubmit={event=>void act(async()=>{
              event.preventDefault(); const form=event.currentTarget; const data=new FormData(form);
              await json(`/api/field-service/${taskId}`,'PATCH',{action:'SIGNOFF',signerName:String(data.get('signerName')||''),signoffMethod:'TYPED_NAME'});
              form.reset();
            })}><input name="signerName" placeholder="Customer sign-off name" required maxLength={240}/><button disabled={busy}>Record sign-off</button></form>:null}
            {signoff?<p className="muted smallText">Customer sign-off recorded · {String(signoff.signoff_method)}</p>:null}

            {!done?<div className="settingsRow">
              {String(task.status)==='OPEN'?<button disabled={busy} onClick={()=>void act(async()=>{await json(`/api/field-service/${taskId}`,'PATCH',{action:'TASK_STATUS',status:'IN_PROGRESS'});})}>Start</button>:null}
              <button disabled={busy} onClick={()=>void act(async()=>{await json(`/api/field-service/${taskId}`,'PATCH',{action:'TASK_STATUS',status:'DONE',completionNote:'Field Service completed'});})}>Complete</button>
              <button disabled={busy} onClick={()=>void act(async()=>{await json(`/api/field-service/${taskId}`,'PATCH',{action:'TASK_STATUS',status:'CANCELED'});})}>Cancel</button>
            </div>:null}
          </div>;
        })}
      </div>
      {message?<p className="muted smallText" role="status">{message}</p>:null}
    </section>
  </div>;
}
