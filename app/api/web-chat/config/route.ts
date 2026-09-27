import { NextResponse } from 'next/server';
import { getPublicWebChatConfig, PublicWebChatError, webChatCorsHeaders } from '@/lib/web-chat/runtime';

export const runtime='nodejs';

export async function OPTIONS(request:Request){
  const u=new URL(request.url);const key=u.searchParams.get('key')?.trim()??'';
  const headers=await webChatCorsHeaders(key,request.headers.get('origin'));
  if(!headers)return new Response(null,{status:403});
  return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
}
export async function GET(request:Request){
  const u=new URL(request.url);const key=u.searchParams.get('key')?.trim()??'';const origin=request.headers.get('origin');
  const cors=await webChatCorsHeaders(key,origin);if(!cors)return NextResponse.json({error:'ORIGIN_NOT_ALLOWED'},{status:403});
  try{return NextResponse.json(await getPublicWebChatConfig({publicKey:key,origin:origin??''}),{headers:{...cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'}})}
  catch(e){const code=e instanceof PublicWebChatError?e.code:'SERVICE_UNAVAILABLE';return NextResponse.json({error:code},{status:code==='WIDGET_UNAVAILABLE'?404:code==='ORIGIN_NOT_ALLOWED'?403:503,headers:{...cors,'Cache-Control':'no-store'}})}
}
