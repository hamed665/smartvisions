import { NextResponse } from 'next/server';
import { PublicWebChatError, readPublicWebChatMessages, webChatCorsHeaders } from '@/lib/web-chat/runtime';

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
  const sessionId=request.headers.get('x-web-chat-session-id')?.trim()??'';const sessionToken=request.headers.get('x-web-chat-session-token')?.trim()??'';
  if(!sessionId||!sessionToken||sessionToken.length>256)return NextResponse.json({error:'SESSION_UNAVAILABLE'},{status:401,headers:cors});
  try{
    const result=await readPublicWebChatMessages({publicKey:key,origin:origin??'',sessionId,sessionToken,after:u.searchParams.get('after'),limit:Number(u.searchParams.get('limit')??50)});
    return NextResponse.json(result,{headers:{...cors,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store'}});
  }catch(e){
    const code=e instanceof PublicWebChatError?e.code:'SERVICE_UNAVAILABLE';
    const status=code==='SESSION_UNAVAILABLE'?401:code==='MESSAGE_INVALID'?400:code==='WIDGET_UNAVAILABLE'?404:code==='ORIGIN_NOT_ALLOWED'?403:503;
    return NextResponse.json({error:code},{status,headers:{...cors,'Cache-Control':'no-store'}});
  }
}
