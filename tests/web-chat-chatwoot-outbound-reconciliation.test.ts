import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { reconcileChatwootWebhookEvent } from '@/lib/chatwoot/unified-inbox-reconciler';

describe('Web Chat signed Chatwoot outbound reconciliation',()=>{
  it('consumes a signed message_created event through the Web Chat governed RPC before generic projection parsing',async()=>{
    const rpc=vi.fn(async(name:string)=>{
      if(name==='reconcile_web_chat_chatwoot_outbound_event'){
        return {data:[{handled:true,outcome:'INSERTED',message_id:'00000000-0000-4000-8000-000000001116',event_status:'PROCESSED'}],error:null};
      }
      throw new Error('unexpected rpc '+name);
    });
    const result=await reconcileChatwootWebhookEvent({rpc} as never,{
      id:'00000000-0000-4000-8000-000000001115',
      event_type:'message_created',
      status:'RECEIVED',
      payload:{message_type:'outgoing',private:false,content:'hello'},
    });
    expect(result).toEqual({action:'WEB_CHAT_OUTBOUND_SYNCED',messageId:'00000000-0000-4000-8000-000000001116'});
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('reconcile_web_chat_chatwoot_outbound_event',{p_event_id:'00000000-0000-4000-8000-000000001115'});
  });
});
