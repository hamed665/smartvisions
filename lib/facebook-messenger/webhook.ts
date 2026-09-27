import { verifyMetaSignature } from '@/lib/whatsapp/webhook';
export { verifyMetaSignature };

type MessagingEvent={sender?:{id?:string};recipient?:{id?:string};timestamp?:number;message?:{mid?:string;text?:string;is_echo?:boolean;attachments?:unknown[]};postback?:{mid?:string;title?:string;payload?:string};reaction?:{mid?:string;action?:string;reaction?:string;emoji?:string};read?:{mid?:string;watermark?:number};delivery?:{mids?:string[];watermark?:number}};
export type NormalizedMessengerEvent={providerEventId:string;destinationId:string;senderId?:string;eventType:'MESSAGE'|'POSTBACK'|'REACTION'|'READ'|'DELIVERY';occurredAt?:string;payload:Record<string,unknown>};
const clean=(v:unknown)=>typeof v==='string'&&v.trim()?v.trim():undefined;
export function extractMessengerEvents(payload:unknown):NormalizedMessengerEvent[]{
 const root=payload as {object?:string;entry?:Array<{id?:string;time?:number;messaging?:MessagingEvent[]}>};
 if(root.object&&root.object!=='page') return [];
 const out:NormalizedMessengerEvent[]=[];
 for(const entry of root.entry??[]){const pageId=clean(entry.id);if(!pageId)continue;
  for(const [index,e] of (entry.messaging??[]).entries()){
   let eventType:NormalizedMessengerEvent['eventType']|null=null;
   if(e.message)eventType='MESSAGE';else if(e.postback)eventType='POSTBACK';else if(e.reaction)eventType='REACTION';else if(e.read)eventType='READ';else if(e.delivery)eventType='DELIVERY';if(!eventType)continue;
   const mid=clean(e.message?.mid)??clean(e.postback?.mid)??clean(e.reaction?.mid)??clean(e.read?.mid)??e.delivery?.mids?.map(clean).filter(Boolean).join(',');
   const providerEventId=mid?`${pageId}:${mid}`:`${pageId}:${e.timestamp??e.read?.watermark??e.delivery?.watermark??'unknown'}:${index}`;
   out.push({providerEventId,destinationId:pageId,...(clean(e.sender?.id)?{senderId:clean(e.sender?.id)}:{}),eventType,...(e.timestamp?{occurredAt:new Date(e.timestamp).toISOString()}:{}),payload:{messageId:clean(e.message?.mid)??clean(e.postback?.mid)??clean(e.reaction?.mid),text:clean(e.message?.text),isEcho:Boolean(e.message?.is_echo),attachments:e.message?.attachments??[],postback:e.postback??null,reaction:e.reaction??null,read:e.read??null,delivery:e.delivery??null}});
  }
 } return out;
}
