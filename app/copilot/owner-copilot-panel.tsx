'use client';

import { FormEvent, useState } from 'react';

type AskPayload={
  mode?:'ANSWER'|'CLARIFY'|'BLOCKED'|'PREVIEW'|'EXECUTED';
  text?:string;
  importance?:string;
  reason?:string;
  confirmationToken?:string;
  preview?:{title?:string;text?:string;before?:unknown;after?:unknown};
  result?:{title?:string;text?:string;after?:unknown};
  error?:string;
};

type Entry={
  role:'user'|'assistant';
  text:string;
  mode?:string;
};

export function OwnerCopilotPanel({mutationBlocked}:{mutationBlocked:boolean}){
  const [question,setQuestion]=useState('');
  const [entries,setEntries]=useState<Entry[]>([]);
  const [pending,setPending]=useState<AskPayload|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function post(body:Record<string,unknown>){
    const response=await fetch('/api/owner-copilot',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body),
    });
    const payload=await response.json() as AskPayload;
    if(!response.ok) throw new Error(payload.error||payload.text||'Owner Copilot request failed');
    return payload;
  }

  async function ask(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const text=question.trim();
    if(!text||busy) return;
    setBusy(true); setError(''); setQuestion(''); setPending(null);
    setEntries((current)=>[...current,{role:'user',text}]);
    try{
      const payload=await post({mode:'ASK',text});
      if(payload.mode==='PREVIEW'){
        setPending(payload);
        setEntries((current)=>[...current,{
          role:'assistant',
          mode:'PREVIEW',
          text:payload.preview?.text||'A governed action is ready for review.',
        }]);
      }else{
        setEntries((current)=>[...current,{
          role:'assistant',
          mode:payload.mode,
          text:payload.text||payload.reason||'No answer was returned.',
        }]);
      }
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Owner Copilot request failed');
    }finally{setBusy(false);}
  }

  async function confirm(){
    if(!pending?.confirmationToken||busy) return;
    setBusy(true); setError('');
    try{
      const payload=await post({
        mode:'CONFIRM',
        confirmed:true,
        confirmationToken:pending.confirmationToken,
      });
      setEntries((current)=>[...current,{
        role:'assistant',
        mode:'EXECUTED',
        text:payload.result?.text||'Action executed and verified.',
      }]);
      setPending(null);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Owner Copilot confirmation failed');
    }finally{setBusy(false);}
  }

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Operational conversation</h2>
        <p className="muted">
          Questions use bounded live evidence. Mutations use Tool Registry → signed Preview/Confirm →
          canonical domain action → verifier → Audit Log.
        </p>
      </div>
      <span className="status">OWNER / ADMIN</span>
    </div>

    {entries.length?<div className="settingsList">
      {entries.map((entry,index)=><div className="settingsRow" key={index}>
        <div>
          <strong>{entry.role==='user'?'You':entry.mode==='PREVIEW'?'Owner Copilot · Preview':'Owner Copilot'}</strong>
          <span className="smallText">{entry.text}</span>
        </div>
        {entry.mode?<span className="status">{entry.mode}</span>:null}
      </div>)}
    </div>:<p className="muted smallText">
      Examples: “کارهای عقب افتاده من چیه؟”, “این booking را cancel کن: …”,
      “وضعیت invoiceها چطوره؟”, or “این task را DONE کن: …”.
    </p>}

    {pending?<div className="panel">
      <div className="headerRow">
        <div>
          <strong>{pending.preview?.title||'Confirm governed action'}</strong>
          <p className="muted smallText">
            Review the Preview. Confirmation tokens expire and are bound to your identity, organization and canonical pre-state.
          </p>
        </div>
        <span className="status">CONFIRMATION REQUIRED</span>
      </div>
      <pre className="auditJson">{pending.preview?.text||'Preview unavailable'}</pre>
      <div className="quickActions">
        <button type="button" disabled={busy||mutationBlocked} onClick={()=>void confirm()}>
          {busy?'Executing…':'Confirm action'}
        </button>
        <button type="button" disabled={busy} onClick={()=>setPending(null)}>Cancel</button>
      </div>
      {mutationBlocked?<p className="muted smallText">
        Current runtime policy blocks execution. You can inspect the Preview, but Confirm stays disabled until the canonical runtime gate allows mutation.
      </p>:null}
    </div>:null}

    <form onSubmit={ask} className="settingsGrid">
      <label className="wideField">
        Ask or request an action
        <textarea
          rows={4}
          maxLength={4_000}
          value={question}
          onChange={(event)=>setQuestion(event.target.value)}
          placeholder="مثلاً: taskهای overdue را بگو یا booking با ID مشخص را cancel کن…"
          disabled={busy}
        />
      </label>
      <button disabled={busy||!question.trim()}>{busy?'Working…':'Ask Copilot'}</button>
    </form>
    {error?<p className="muted smallText">⛔ {error}</p>:null}
  </section>;
}
