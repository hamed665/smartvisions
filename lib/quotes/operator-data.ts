import type { SupabaseClient } from '@supabase/supabase-js';

function priceLabel(row: {country_code: unknown; currency: unknown; price: unknown}) {
  return `${String(row.country_code)} ${Number(row.price).toLocaleString(undefined,{maximumFractionDigits:4})} ${String(row.currency)}`;
}

export async function getQuoteComposerOptions(
  supabase: SupabaseClient,
  organizationId: string,
) {
  const [
    {data:tenantBusinesses},
    {data:branches},
    {data:buyers},
    {data:people},
    {data:deals},
    {data:services},
    {data:servicePrices},
    {data:products},
    {data:variants},
    {data:productPrices},
  ]=await Promise.all([
    supabase.from('tenant_businesses').select('id,name,status').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('branches').select('id,tenant_business_id,name,code,status').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('businesses').select('id,name,country_code').eq('organization_id',organizationId).order('name').limit(250),
    supabase.from('crm_people').select('id,display_name,status').eq('organization_id',organizationId).eq('status','ACTIVE').order('display_name').limit(250),
    supabase.from('crm_deals').select('id,business_id,title,state').eq('organization_id',organizationId).eq('state','OPEN').order('updated_at',{ascending:false}).limit(250),
    supabase.from('services').select('id,name,enabled').eq('organization_id',organizationId).eq('enabled',true).order('name'),
    supabase.from('service_prices').select('id,service_id,country_code,currency,price').eq('organization_id',organizationId).order('country_code'),
    supabase.from('catalog_products').select('id,tenant_business_id,sku,name,status').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_variants').select('id,product_id,sku,name,status').eq('organization_id',organizationId).eq('status','ACTIVE').order('name'),
    supabase.from('catalog_product_prices').select('id,product_id,variant_id,country_code,currency,price').eq('organization_id',organizationId).order('country_code'),
  ]);

  const productById=new Map((products??[]).map(row=>[String(row.id),row]));
  const servicePricesById=new Map<string,typeof servicePrices>();
  for(const row of servicePrices??[]){
    const key=String(row.service_id);
    const list=servicePricesById.get(key)??[];
    list.push(row);
    servicePricesById.set(key,list);
  }
  const productPricesById=new Map<string,typeof productPrices>();
  const variantPricesById=new Map<string,typeof productPrices>();
  for(const row of productPrices??[]){
    const productKey=String(row.product_id);
    if(row.variant_id){
      const variantKey=String(row.variant_id);
      const list=variantPricesById.get(variantKey)??[];
      list.push(row);
      variantPricesById.set(variantKey,list);
    }else{
      const list=productPricesById.get(productKey)??[];
      list.push(row);
      productPricesById.set(productKey,list);
    }
  }

  return {
    tenantBusinesses:(tenantBusinesses??[]).map(row=>({id:String(row.id),label:String(row.name)})),
    branches:(branches??[]).map(row=>({
      id:String(row.id),
      label:`${String(row.name)} · ${String(row.code)}`,
      tenantBusinessId:String(row.tenant_business_id),
    })),
    buyers:(buyers??[]).map(row=>({
      id:String(row.id),
      label:`${String(row.name)} · ${String(row.country_code)}`,
    })),
    people:(people??[]).map(row=>({
      id:String(row.id),
      label:String(row.display_name??row.id),
    })),
    deals:(deals??[]).map(row=>({
      id:String(row.id),
      label:String(row.title),
      buyerBusinessId:row.business_id?String(row.business_id):null,
    })),
    catalog:[
      ...(services??[]).map(row=>({
        ref:`SERVICE:${String(row.id)}`,
        label:`Service · ${String(row.name)}`,
        tenantBusinessId:null,
        prices:(servicePricesById.get(String(row.id))??[]).map(priceLabel),
      })),
      ...(products??[]).map(row=>({
        ref:`PRODUCT:${String(row.id)}`,
        label:`Product · ${String(row.name)} · ${String(row.sku)}`,
        tenantBusinessId:String(row.tenant_business_id),
        prices:(productPricesById.get(String(row.id))??[]).map(priceLabel),
      })),
      ...(variants??[]).map(row=>{
        const product=productById.get(String(row.product_id));
        return {
          ref:`VARIANT:${String(row.id)}`,
          label:`Variant · ${String(product?.name??'Product')} / ${String(row.name)} · ${String(row.sku)}`,
          tenantBusinessId:product?String(product.tenant_business_id):null,
          prices:(variantPricesById.get(String(row.id))??[]).map(priceLabel),
        };
      }),
    ],
  };
}
