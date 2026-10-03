import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PanelParityCommand } from '@/lib/telegram/panel-parity-types';

const MAX_AGE_MS=10*60*1000;
const MAX_TOKEN_CHARS=20_000;

type Payload={
  v:1;
  organizationId:string;
  userId:string;
  role:'OWNER'|'ADMIN';
  issuedAt:number;
  confirmationId:string;
  command:PanelParityCommand;
  preview:{before?:unknown;after?:unknown};
};

function stable(value:unknown):string {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const row=value as Record<string,unknown>;
  return `{${Object.keys(row).sort().map((key)=>`${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
}
function secret(){
  const value=process.env.INTERNAL_API_KEY?.trim();
  if(!value||value.length<16) throw new Error('Owner Copilot confirmation signing is unavailable');
  return value;
}
function signature(encoded:string){
  return createHmac('sha256',secret()).update(`owner-copilot-preview-v1.${encoded}`,'utf8').digest('base64url');
}

export function createOwnerCopilotPreviewToken(input:Omit<Payload,'v'|'issuedAt'>){
  const payload:Payload={v:1,issuedAt:Date.now(),...input};
  const encoded=Buffer.from(stable(payload),'utf8').toString('base64url');
  if(encoded.length>MAX_TOKEN_CHARS) throw new Error('Owner Copilot preview is too large to sign');
  return `${encoded}.${signature(encoded)}`;
}

export function verifyOwnerCopilotPreviewToken(token:string,input:{organizationId:string;userId:string;role:string}):Payload {
  if(!token||token.length>MAX_TOKEN_CHARS+100) throw new Error('Owner Copilot preview token is invalid');
  const [encoded,supplied,...rest]=token.split('.');
  if(!encoded||!supplied||rest.length) throw new Error('Owner Copilot preview token is invalid');
  const expected=signature(encoded);
  const a=Buffer.from(expected); const b=Buffer.from(supplied);
  if(a.length!==b.length||!timingSafeEqual(a,b)) throw new Error('Owner Copilot preview signature is invalid');
  let payload:Payload;
  try{payload=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')) as Payload;}
  catch{throw new Error('Owner Copilot preview payload is invalid');}
  if(payload.v!==1||Date.now()-payload.issuedAt>MAX_AGE_MS||payload.issuedAt>Date.now()+30_000) throw new Error('Owner Copilot preview expired');
  if(!/^[0-9a-f-]{36}$/i.test(String(payload.confirmationId??''))) throw new Error('Owner Copilot confirmation evidence is invalid');
  if(payload.organizationId!==input.organizationId||payload.userId!==input.userId||payload.role!==input.role) throw new Error('Owner Copilot preview identity mismatch');
  return payload;
}
