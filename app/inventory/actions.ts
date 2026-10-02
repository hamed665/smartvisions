'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentOrganization } from '@/lib/supabase/org';
import { createSupabaseServiceClient } from '@/lib/supabase/service';

const INVENTORY_MANAGER_ROLES=new Set(['OWNER','ADMIN','SALES_MANAGER']);

function field(fd:FormData,key:string){return String(fd.get(key)??'').trim();}
function optional(fd:FormData,key:string){const v=field(fd,key);return v||null;}
function numeric(fd:FormData,key:string){const raw=field(fd,key);const v=Number(raw);if(!raw||!Number.isFinite(v))throw new Error(key+' must be a number');return v;}
function optionalInteger(fd:FormData,key:string){const raw=field(fd,key);if(!raw)return null;const v=Number(raw);if(!Number.isInteger(v))throw new Error(key+' must be an integer');return v;}
function evidence(note:string){const value=note.trim();if(value.length<3)throw new Error('Evidence must be at least 3 characters');return {note:value,recordedAt:new Date().toISOString()};}
function jsonObject(raw:string,label:string){
  const value=JSON.parse(raw||'{}');
  if(!value||Array.isArray(value)||typeof value!=='object')throw new Error(label+' must be a JSON object');
  return value;
}
function splitRef(raw:string,expected:number,label:string){
  const parts=raw.split('|');
  if(parts.length!==expected||parts.some((part,index)=>index!==1&&part.length<1))throw new Error(label+' is invalid');
  return parts;
}
async function context(){
  const current=await getCurrentOrganization();
  if(!current.userId||!INVENTORY_MANAGER_ROLES.has(String(current.role)))throw new Error('Inventory manager permission required');
  return {...current,service:createSupabaseServiceClient()};
}
function rpcError(label:string,error:{message?:string}|null){if(error)throw new Error(label+': '+(error.message??'unknown error'));}
function refresh(orderId?:string){
  revalidatePath('/inventory');
  revalidatePath('/catalog');
  revalidatePath('/orders');
  if(orderId)revalidatePath('/orders/'+orderId);
}

export async function configureInventoryLocationV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const kind=field(fd,'location_kind').toUpperCase();
  const branchId=optional(fd,'branch_id');
  if(kind==='BRANCH'&&!branchId)throw new Error('Branch stock location requires a Branch');
  if(kind==='WAREHOUSE'&&branchId)throw new Error('Warehouse cannot reuse a Branch identifier');
  const {error}=await service.rpc('configure_inventory_location_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,
    p_location_id:field(fd,'location_id'),p_tenant_business_id:field(fd,'tenant_business_id'),
    p_location_kind:kind,p_branch_id:branchId,p_code:field(fd,'code'),p_name:field(fd,'name'),
    p_status:field(fd,'status'),p_metadata:jsonObject(field(fd,'metadata_json'),'Location metadata'),
    p_expected_version:optionalInteger(fd,'expected_version'),p_request_key:field(fd,'request_key'),
  });
  rpcError('Configure inventory location failed',error);refresh();
}

export async function configureInventoryItemV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const [productId,variantId,businessId]=splitRef(field(fd,'subject_ref'),3,'Catalog stock subject');
  const {error}=await service.rpc('configure_inventory_item_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_item_id:field(fd,'item_id'),
    p_tenant_business_id:businessId,p_product_id:productId,p_variant_id:variantId||null,
    p_unit_code:field(fd,'unit_code'),p_low_stock_threshold:numeric(fd,'low_stock_threshold'),
    p_status:field(fd,'status'),p_expected_version:optionalInteger(fd,'expected_version'),
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Configure inventory item failed',error);refresh();
}

export async function adjustInventoryStockV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const delta=numeric(fd,'on_hand_delta');
  if(delta===0)throw new Error('Stock adjustment cannot be zero');
  const {error}=await service.rpc('adjust_inventory_stock_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_item_id:field(fd,'item_id'),
    p_location_id:field(fd,'location_id'),p_on_hand_delta:delta,p_reason:field(fd,'reason'),
    p_evidence:evidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Adjust inventory stock failed',error);refresh();
}

export async function reserveOrderInventoryV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const [orderId,lineId]=splitRef(field(fd,'order_line_ref'),2,'Order line');
  const {error}=await service.rpc('reserve_order_inventory_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_reservation_id:field(fd,'reservation_id'),
    p_order_id:orderId,p_order_line_item_id:lineId,p_location_id:field(fd,'location_id'),
    p_quantity:numeric(fd,'quantity'),p_evidence:evidence(field(fd,'evidence_note')),
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Reserve Order inventory failed',error);refresh(orderId);
}

export async function releaseInventoryReservationV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const {error}=await service.rpc('release_inventory_reservation_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_reservation_id:field(fd,'reservation_id'),
    p_quantity:numeric(fd,'quantity'),p_reason:field(fd,'reason'),
    p_evidence:evidence(field(fd,'evidence_note')),p_request_key:field(fd,'request_key'),
  });
  rpcError('Release inventory reservation failed',error);refresh(orderId);
}

export async function fulfillOrderInventoryV1(fd:FormData){
  const {organizationId,userId,service}=await context();
  const orderId=field(fd,'order_id');
  const {error}=await service.rpc('fulfill_order_inventory_v1',{
    p_organization_id:organizationId,p_actor_user_id:userId,p_reservation_id:field(fd,'reservation_id'),
    p_quantity:numeric(fd,'quantity'),p_evidence:evidence(field(fd,'evidence_note')),
    p_request_key:field(fd,'request_key'),
  });
  rpcError('Fulfill reserved Order inventory failed',error);refresh(orderId);
}
