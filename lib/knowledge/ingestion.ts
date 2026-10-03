import 'server-only';

import {Crawl4AiAuditor} from '@/lib/audit/crawl4ai';
import type {WebsiteAuditResult} from '@/lib/audit/types';

const MAX_SOURCE_BYTES=5*1024*1024;
const MAX_TEXT_CHARS=220_000;

export type ExtractedKnowledgeContent={
  text:string;
  title?:string;
  sourceLocator:string;
  contentType:string;
  etag?:string;
  lastModified?:string;
  extraction:string;
  websiteAudit?:WebsiteAuditResult;
};

function cleanText(value:string){
  return value
    .replace(/\r\n?/g,'\n')
    .replace(/[\t\f\v ]+/g,' ')
    .replace(/ *\n */g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim()
    .slice(0,MAX_TEXT_CHARS);
}

function decodeEntities(value:string){
  return value
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}

function htmlToText(html:string){
  const title=decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'').replace(/<[^>]+>/g,' ')).trim().slice(0,240);
  const body=html
    .replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi,' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)>/gi,'\n')
    .replace(/<[^>]+>/g,' ');
  return {title:title||undefined,text:cleanText(decodeEntities(body))};
}

function privateIpv4(host:string){
  const parts=host.split('.').map(Number);
  if(parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return false;
  const [a,b]=parts;
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}

function assertPublicHttpUrl(raw:string){
  const url=new URL(raw);
  if(!['http:','https:'].includes(url.protocol))throw new Error('Knowledge website URL must use HTTP or HTTPS');
  if(url.username||url.password)throw new Error('Knowledge website URL cannot contain credentials');
  if(url.port&&!['80','443'].includes(url.port))throw new Error('Knowledge website URL uses a blocked port');
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')){
    throw new Error('Knowledge website URL points to a blocked local host');
  }
  if(privateIpv4(host)||host==='::1'||host.startsWith('fc')||host.startsWith('fd')||host.startsWith('fe80:')){
    throw new Error('Knowledge website URL points to a blocked private address');
  }
  return url;
}

function websiteAuditText(audit:WebsiteAuditResult){
  const parts=[
    audit.title?'Title: '+audit.title:'',
    audit.detectedLanguages.length?'Languages: '+audit.detectedLanguages.join(', '):'',
    audit.services.length?'Services: '+audit.services.join(', '):'',
    audit.contactEmails.length?'Emails: '+audit.contactEmails.join(', '):'',
    audit.contactPhones.length?'Phones: '+audit.contactPhones.join(', '):'',
    Object.keys(audit.socialLinks).length?'Social: '+Object.entries(audit.socialLinks).map(([key,value])=>key+': '+value).join(', '):'',
    'Booking: '+(audit.hasBooking?'yes':'no'),
    'WhatsApp: '+(audit.hasWhatsapp?'yes':'no'),
    'Mobile quality: '+audit.mobileQuality,
    'SEO quality: '+audit.seoQuality,
    'CTA quality: '+audit.ctaQuality,
    'Broken links: '+audit.brokenLinks,
  ].filter(Boolean);
  return cleanText(parts.join('\n'));
}

function crawl4AiBaseUrl(){
  const raw=String(process.env.CRAWL4AI_URL??'').trim();
  if(!raw)throw new Error('KNOWLEDGE_CRAWL4AI_NOT_CONFIGURED');
  let url:URL;
  try{url=new URL(raw);}catch{throw new Error('KNOWLEDGE_CRAWL4AI_CONFIG_INVALID');}
  if(!['http:','https:'].includes(url.protocol))throw new Error('KNOWLEDGE_CRAWL4AI_CONFIG_INVALID');
  return url.toString();
}

export async function crawlWebsiteKnowledge(rawUrl:string):Promise<ExtractedKnowledgeContent>{
  const target=assertPublicHttpUrl(rawUrl);
  const auditor=new Crawl4AiAuditor(crawl4AiBaseUrl());
  const audit=await auditor.audit(target.toString());
  const sourceLocator=assertPublicHttpUrl(audit.sourceUrl||target.toString()).toString();
  const normalizedAudit={...audit,sourceUrl:sourceLocator};
  const text=websiteAuditText(normalizedAudit);
  if(text.length<20)throw new Error('KNOWLEDGE_CRAWL4AI_EMPTY_EVIDENCE');
  return {
    text,
    title:normalizedAudit.title,
    sourceLocator,
    contentType:'application/vnd.smartvisions.crawl4ai-audit+json',
    extraction:'CRAWL4AI_AUDIT',
    websiteAudit:normalizedAudit,
  };
}
function latin1(bytes:Uint8Array){
  let out='';
  for(let i=0;i<bytes.length;i+=8192){
    out+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+8192)));
  }
  return out;
}

async function inflate(bytes:Uint8Array,format:'deflate'|'deflate-raw'){
  const copy=Uint8Array.from(bytes);
  const decompressed=new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}

function pdfString(value:string){
  let out='';
  for(let i=0;i<value.length;i+=1){
    const c=value[i];
    if(c!=='\\'){out+=c;continue;}
    const n=value[++i];
    if(n===undefined)break;
    if(n==='n')out+='\n';
    else if(n==='r')out+='\r';
    else if(n==='t')out+='\t';
    else if(n==='b')out+='\b';
    else if(n==='f')out+='\f';
    else if(n==='\n'||n==='\r')continue;
    else if(/[0-7]/.test(n)){
      let oct=n;
      for(let j=0;j<2&&/[0-7]/.test(value[i+1]??'');j+=1)oct+=value[++i];
      out+=String.fromCharCode(parseInt(oct,8));
    }else out+=n;
  }
  return out;
}

function extractPdfOperators(stream:string){
  const parts:string[]=[];
  for(const match of stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))parts.push(pdfString(match[1]));
  for(const arr of stream.matchAll(/\[([\s\S]*?)\]\s*TJ/g)){
    for(const item of arr[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g))parts.push(pdfString(item[1]));
  }
  for(const match of stream.matchAll(/<([0-9A-Fa-f]{4,})>\s*Tj/g)){
    const hex=match[1];
    const bytes=new Uint8Array(hex.length/2);
    for(let i=0;i<bytes.length;i+=1)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);
    let text='';
    if(bytes[0]===0xfe&&bytes[1]===0xff){
      for(let i=2;i+1<bytes.length;i+=2)text+=String.fromCharCode((bytes[i]<<8)|bytes[i+1]);
    }else text=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    parts.push(text);
  }
  return parts.join(' ');
}

async function extractPdf(bytes:Uint8Array){
  const source=latin1(bytes);
  if(!source.startsWith('%PDF-'))throw new Error('Uploaded PDF signature is invalid');
  const texts:string[]=[];
  let cursor=0;
  while(true){
    const marker=source.indexOf('stream',cursor);
    if(marker<0)break;
    const after=marker+6;
    let start=after;
    if(source.startsWith('\r\n',start))start+=2;
    else if(source[start]==='\n'||source[start]==='\r')start+=1;
    else {cursor=after;continue;}
    const end=source.indexOf('endstream',start);
    if(end<0)break;
    let endBytes=end;
    while(endBytes>start&&(bytes[endBytes-1]===10||bytes[endBytes-1]===13))endBytes-=1;
    const dict=source.slice(Math.max(0,marker-800),marker);
    let payload=bytes.slice(start,endBytes);
    try{
      if(/\/FlateDecode\b/.test(dict))payload=await inflate(payload,'deflate');
      const extracted=extractPdfOperators(latin1(payload));
      if(extracted.trim())texts.push(extracted);
    }catch{
      // A single unsupported PDF stream must not poison other extractable streams.
    }
    cursor=end+9;
  }
  const text=cleanText(texts.join('\n'));
  if(text.length<20){
    throw new Error('PDF_TEXT_EXTRACTION_EMPTY_OR_SCANNED');
  }
  return text;
}

function u16(view:DataView,offset:number){return view.getUint16(offset,true);}
function u32(view:DataView,offset:number){return view.getUint32(offset,true);}

async function extractDocx(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let eocd=-1;
  for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65557);i-=1){
    if(u32(view,i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0)throw new Error('DOCX central directory was not found');
  const entries=u16(view,eocd+10);
  let pos=u32(view,eocd+16);
  const xmlParts:string[]=[];
  for(let n=0;n<entries;n+=1){
    if(pos+46>bytes.byteLength||u32(view,pos)!==0x02014b50)break;
    const compression=u16(view,pos+10);
    const compressedSize=u32(view,pos+20);
    const nameLen=u16(view,pos+28);
    const extraLen=u16(view,pos+30);
    const commentLen=u16(view,pos+32);
    const localOffset=u32(view,pos+42);
    const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nameLen));
    if(/^word\/(document|header\d*|footer\d*)\.xml$/i.test(name)){
      if(localOffset+30>bytes.byteLength||u32(view,localOffset)!==0x04034b50)throw new Error('DOCX local entry is invalid');
      const localNameLen=u16(view,localOffset+26);
      const localExtraLen=u16(view,localOffset+28);
      const dataStart=localOffset+30+localNameLen+localExtraLen;
      const packed=bytes.slice(dataStart,dataStart+compressedSize);
      const unpacked=compression===0?packed:compression===8?await inflate(packed,'deflate-raw'):null;
      if(!unpacked)throw new Error('DOCX compression method is unsupported');
      xmlParts.push(new TextDecoder('utf-8',{fatal:false}).decode(unpacked));
    }
    pos+=46+nameLen+extraLen+commentLen;
  }
  if(!xmlParts.length)throw new Error('DOCX document text was not found');
  const text=cleanText(decodeEntities(
    xmlParts.join('\n')
      .replace(/<w:tab\b[^>]*\/>/gi,'\t')
      .replace(/<w:br\b[^>]*\/>/gi,'\n')
      .replace(/<\/w:p>/gi,'\n')
      .replace(/<[^>]+>/g,' ')
  ));
  if(text.length<10)throw new Error('DOCX did not contain enough extractable text');
  return text;
}

export async function extractKnowledgeFile(file:File):Promise<ExtractedKnowledgeContent>{
  if(!file||file.size<=0)throw new Error('Knowledge file is empty');
  if(file.size>MAX_SOURCE_BYTES)throw new Error('Knowledge file exceeds the 5 MB ingestion limit');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const name=(file.name||'upload').slice(0,240);
  const lower=name.toLowerCase();
  let text='';
  let extraction='';
  const contentType=file.type||'application/octet-stream';

  if(lower.endsWith('.pdf')||file.type==='application/pdf'){
    text=await extractPdf(bytes); extraction='PDF_TEXT';
  }else if(lower.endsWith('.docx')||file.type==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
    text=await extractDocx(bytes); extraction='DOCX_XML';
  }else{
    const raw=new TextDecoder('utf-8',{fatal:false}).decode(bytes);
    if(lower.endsWith('.html')||lower.endsWith('.htm')||file.type.includes('html')){
      text=htmlToText(raw).text; extraction='HTML_TEXT';
    }else if(
      lower.endsWith('.txt')||lower.endsWith('.md')||lower.endsWith('.csv')||lower.endsWith('.json')||
      file.type.startsWith('text/')||file.type==='application/json'
    ){
      text=cleanText(raw); extraction='PLAIN_TEXT';
    }else{
      throw new Error('Unsupported Knowledge file type. Use PDF, DOCX, TXT, Markdown, HTML, CSV or JSON');
    }
  }

  if(text.length<10)throw new Error('Knowledge file did not contain enough extractable text');
  return {text,sourceLocator:name,contentType,extraction};
}
