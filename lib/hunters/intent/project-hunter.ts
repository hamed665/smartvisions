import { createHash } from 'node:crypto';
import { evaluateIntentOpportunity } from './evaluate';
import type { IntentSource } from './types';

export const PROJECT_CHANNELS = ['UPWORK', 'PEOPLEPERHOUR', 'CONTRA', 'FREELANCER', 'GURU', 'LINKEDIN', 'OMAN_TENDER', 'DIRECT', 'OTHER'] as const;
export type ProjectChannel = typeof PROJECT_CHANNELS[number];

export type ProjectHunterInput = {
  channel: ProjectChannel;
  title: string;
  body: string;
  sourceUrl: string;
  postedAt?: string;
  budgetAmount?: number;
  budgetCurrency?: string;
  proposalCount?: number;
  paymentVerified?: boolean;
};

const sourceType: Record<ProjectChannel, IntentSource> = {
  UPWORK: 'upwork_alert', PEOPLEPERHOUR: 'peopleperhour_alert',
  CONTRA: 'public_post', FREELANCER: 'freelancer', GURU: 'public_post',
  LINKEDIN: 'public_post', OMAN_TENDER: 'public_post', DIRECT: 'inbound', OTHER: 'manual',
};
const skills: Array<{label:string; pattern:RegExp}> = [
  {label:'Next.js',pattern:/\bnext\.?js\b/i},
  {label:'React',pattern:/\breact\b/i},
  {label:'TypeScript',pattern:/\btypescript\b/i},
  {label:'Supabase',pattern:/\bsupabase\b/i},
  {label:'PostgreSQL',pattern:/\bpostgres(?:ql)?\b/i},
  {label:'Cloudflare',pattern:/\bcloudflare\b/i},
  {label:'SaaS',pattern:/\bsaas\b|software.as.a.service/i},
  {label:'AI Agents',pattern:/\bai agent(?:s)?\b|\bagentic\b/i},
  {label:'n8n',pattern:/\bn8n\b/i},
  {label:'Automation',pattern:/\bautomati(?:on|ons|ng|ze)\b/i},
  {label:'WordPress',pattern:/\bwordpress\b/i},
  {label:'SEO',pattern:/\bseo\b|search engine optimi[sz]ation/i},
  {label:'API Integration',pattern:/\bapi integration\b|\brest apis?\b/i},
];
const officialHosts: Partial<Record<ProjectChannel,string>> = {
  UPWORK:'upwork.com',
  PEOPLEPERHOUR:'peopleperhour.com',
  CONTRA:'contra.com',
  FREELANCER:'freelancer.com',
  GURU:'guru.com',
  LINKEDIN:'linkedin.com',
};
const explicitGeoRestriction = /\b(?:us|usa|united states|canada|uk|united kingdom|europe|eu|americas)\s+(?:residents?\s+)?only\b|\bmust (?:be )?(?:located|based|resident) in (?:the )?(?:us|usa|united states|canada|uk|united kingdom|europe|eu|americas)\b|\bonly (?:applicants?|candidates?) (?:from|in) (?:the )?(?:us|usa|united states|canada|uk|united kingdom|europe|eu|americas)\b/i;

export function normalizeProjectHunterInput(raw: ProjectHunterInput): ProjectHunterInput {
  if (!PROJECT_CHANNELS.includes(raw.channel)) throw new Error('Unsupported opportunity channel');
  const title = raw.title.trim().replace(/\s+/g, ' ');
  const body = raw.body.trim();
  if (title.length < 8 || title.length > 180) throw new Error('Title must be between 8 and 180 characters');
  if (body.length < 40 || body.length > 8000) throw new Error('Description must be 40–8000 characters');
  let url: URL;
  try { url = new URL(raw.sourceUrl.trim()); }
  catch { throw new Error('A valid public https opportunity URL is required'); }
  if (url.protocol !== 'https:' || !url.hostname.includes('.') || url.username || url.password) {
    throw new Error('A public https opportunity URL is required');
  }
  const host=officialHosts[raw.channel];
  if (host && !(url.hostname===host || url.hostname.endsWith('.'+host))) {
    throw new Error('The source link does not match the selected platform');
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|ref$)/i.test(key)) url.searchParams.delete(key);
  }
  const posted = raw.postedAt?.trim();
  const currency = (raw.budgetCurrency || 'USD').toUpperCase().trim();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Budget currency must be a three-letter code');
  if (posted && (!Number.isFinite(Date.parse(posted)) || Date.parse(posted) > Date.now() + 5 * 60_000)) {
    throw new Error('Posted date is invalid or in the future');
  }
  const budget = raw.budgetAmount;
  if (budget != null && (!Number.isFinite(budget) || budget < 0 || budget > 100_000_000)) {
    throw new Error('Budget is outside permitted range');
  }
  const proposalCount = raw.proposalCount;
  if (proposalCount != null && (!Number.isSafeInteger(proposalCount) || proposalCount < 0 || proposalCount > 1_000_000)) {
    throw new Error('Proposal count is invalid');
  }
  return {...raw,title,body,sourceUrl:url.toString(),postedAt:posted || undefined,
    budgetCurrency:currency};
}

export function projectHunterSourceId(channel: ProjectChannel, sourceUrl: string): string {
  return createHash('sha256').update(channel + '\n' + sourceUrl).digest('hex');
}

export function evaluateProjectHunter(raw: ProjectHunterInput, detectedAt: string = new Date().toISOString()) {
  const input = normalizeProjectHunterInput(raw);
  const content = input.title + '\n' + input.body;
  const matches = skills.filter(skill=>skill.pattern.test(content)).map(skill=>skill.label);
  const geoRestricted = explicitGeoRestriction.test(content);
  const base = evaluateIntentOpportunity({
    sourceType:sourceType[input.channel],sourceUrl:input.sourceUrl,title:input.title,
    body:input.body,detectedAt,postedAt:input.postedAt,
    budgetAmount:input.budgetAmount,budgetCurrency:input.budgetCurrency,
    businessIdentifiable:input.channel==='DIRECT',
    contactMethodAvailable:false,
  });
  const reasons: string[] = [...base.scoring.reasons];
  let fitScore = Math.min(75, matches.length * 14);
  if (matches.length) reasons.push('Direct skill matches: ' + matches.join(', '));
  else reasons.push('No documented core skill match');
  if (input.paymentVerified) {fitScore += 10; reasons.push('Payment verification reported by operator');}
  if (input.proposalCount != null && input.proposalCount <= 20) {fitScore += 15; reasons.push('At most 20 proposals reported');}
  if (input.proposalCount != null && input.proposalCount > 50) {fitScore -= 25; reasons.push('High application competition');}
  if (input.budgetAmount && input.budgetAmount >= 500) {fitScore += 10; reasons.push('Budget meets initial target');}
  if (input.postedAt && Date.now()-Date.parse(input.postedAt)>7*86400_000) {fitScore -= 20; reasons.push('Posting older than 7 days');}
  if (/\b(?:near|within|overlap|matching) (?:the )?(?:us|usa|united states|america[n]?) time ?zone\b|\b(?:pst|pdt|est|edt) (?:working )?hours\b/i.test(content)) {
    fitScore-=20; reasons.push('US-time-zone overlap required: confirm Muscat availability');
  }
  if (geoRestricted) {fitScore = 0; reasons.push('Explicit geography restriction: manual eligibility review required');}
  fitScore = Math.max(0,Math.min(100,fitScore));
  const status = !geoRestricted && base.scoring.priority!=='SKIP' && fitScore>=45 ? 'DRAFT_READY' : 'REVIEW';
  return {
    input,
    sourceType:sourceType[input.channel],
    sourceId:projectHunterSourceId(input.channel,input.sourceUrl),
    intent:base,
    fitScore,geoRestricted,skills:matches,reasons,status,
    // Never grant provider send permission based on a public listing.
    contactability:'REVIEW' as const,
    draft:status==='DRAFT_READY' ? buildProjectProposalDraft(input,matches) : null,
  };
}

export function buildProjectProposalDraft(input: ProjectHunterInput, matches: string[]): string {
  const focus = matches.slice(0,4).join(', ') || 'software development';
  return [
    'Hello,',
    '',
    `I am interested in your project, "${input.title}". The requirements around ${focus} align with my software engineering and architecture work.`,
    '',
    'At Smart Visions, I work on a multi-tenant business platform covering CRM, messaging, booking, integrations, and automation. I can share relevant architecture and implementation details, distinguishing active features from work in progress.',
    '',
    'Before proposing a delivery plan, I would like to confirm your current stack, the highest-priority milestone, and the acceptance criteria. That will help me provide a realistic timeline and price.',
    '',
    'My related portfolio is available on my Upwork profile. I am happy to discuss the technical approach and scope.',
    '',
    'Best regards,',
    'Hamed Minaei',
  ].join('\n');
}
