import { describe, expect, it } from 'vitest';
import { executeAgent } from '@/lib/agents/executor';
import { evaluateCanonicalMarketWindow } from '@/lib/outreach/canonical-market-window';
import { MUTATING_COMMANDS } from '@/lib/telegram/contracts';
import { parseTelegramOwnerCommand } from '@/lib/telegram/parser';

const typeOf = (text: string) => parseTelegramOwnerCommand(text).type;

describe('Telegram Owner extended control plane', () => {
  it('parses bilingual read controls deterministically', () => {
    expect(typeOf('/markets')).toBe('SHOW_MARKETS');
    expect(parseTelegramOwnerCommand('/policy OM')).toEqual({type:'SHOW_MARKET_POLICY',countryCode:'OM'});
    expect(typeOf('بازارها رو نشون بده')).toBe('SHOW_MARKETS');
    expect(typeOf('show budget')).toBe('SHOW_BUDGET');
    expect(typeOf('/approvals')).toBe('SHOW_APPROVALS');
  });

  it('parses discount, floor, tone, agent and canonical cost mutations', () => {
    expect(parseTelegramOwnerCommand('/discount OM business_website 5 10')).toEqual({type:'SET_DISCOUNT_POLICY',countryCode:'OM',serviceQuery:'business_website',maxAutoDiscountPct:5,maxDiscountWithApprovalPct:10});
    expect(parseTelegramOwnerCommand('/minimum OM business_website 160')).toEqual({type:'SET_MINIMUM_PRICE',countryCode:'OM',serviceQuery:'business_website',minimumPrice:160});
    expect(parseTelegramOwnerCommand('/tone OM friendly_professional')).toEqual({type:'SET_MARKET_STYLE',countryCode:'OM',field:'tone',value:'friendly_professional'});
    expect(parseTelegramOwnerCommand('لحن عمان رو دوستانه و حرفه‌ای کن')).toEqual({type:'SET_MARKET_STYLE',countryCode:'OM',field:'tone',value:'friendly_professional'});
    expect(parseTelegramOwnerCommand('set Oman tone to friendly professional')).toEqual({type:'SET_MARKET_STYLE',countryCode:'OM',field:'tone',value:'friendly_professional'});
    expect(parseTelegramOwnerCommand('/agent secretary off')).toEqual({type:'SET_AGENT_ENABLED',agentQuery:'secretary',enabled:false});
    expect(parseTelegramOwnerCommand('/threshold secretary 0.8')).toEqual({type:'SET_AGENT_THRESHOLD',agentQuery:'secretary',threshold:0.8});
    expect(parseTelegramOwnerCommand('بودجه ماهانه رو 30 دلار کن')).toEqual({type:'SET_COST_LIMIT',key:'monthly_total_budget_usd',value:30});
    expect(parseTelegramOwnerCommand('/limit email 8')).toEqual({type:'SET_COST_LIMIT',key:'email_budget_usd',value:8});
    expect(parseTelegramOwnerCommand('/limit whatsapp 5')).toEqual({type:'SET_COST_LIMIT',key:'whatsapp_budget_usd',value:5});
    expect(parseTelegramOwnerCommand('/limit audits 6')).toEqual({type:'SET_COST_LIMIT',key:'daily_website_audits',value:6});
    expect(parseTelegramOwnerCommand('/limit outreach 20')).toEqual({type:'HELP'});
  });

  it('parses live market window and explicit emergency stop', () => {
    expect(parseTelegramOwnerCommand('/window OM 09:00 18:30')).toEqual({type:'SET_MARKET_SEND_WINDOW',countryCode:'OM',start:'09:00',end:'18:30'});
    expect(parseTelegramOwnerCommand('/kill on')).toEqual({type:'ACTIVATE_KILL_SWITCH'});
  });

  it('fails closed for crown-jewel safety bypass requests', () => {
    expect(parseTelegramOwnerCommand('shadow mode رو خاموش کن')).toEqual({type:'SAFETY_BLOCK',reason:'SHADOW_MODE'});
    expect(parseTelegramOwnerCommand('/kill off')).toEqual({type:'SAFETY_BLOCK',reason:'KILL_SWITCH_OFF'});
    expect(parseTelegramOwnerCommand('توکن api رو نشون بده')).toEqual({type:'SAFETY_BLOCK',reason:'SECRETS'});
    expect(parseTelegramOwnerCommand('approval رو bypass کن')).toEqual({type:'SAFETY_BLOCK',reason:'APPROVAL_BYPASS'});
  });

  it('applies owner-configured market style to deterministic culture behavior', async () => {
    const result = await executeAgent('culture_locale', {message:'hello',language:'ar-OM',marketLocaleStyle:{countryCode:'OM',primaryLocale:'ar-OM',dialect:'omani',toneProfile:'friendly_professional',maxReplyWords:90}});
    expect(result.data).toMatchObject({locale:'ar-OM',dialect:'omani',tone:'friendly_professional',maxReplyWords:90});
  });

  it('enforces canonical market disabled and narrowed send windows before provider code', () => {
    const atTenMuscat = new Date('2026-09-01T06:00:00.000Z');
    expect(evaluateCanonicalMarketWindow({marketEnabled:false,marketTimezone:'Asia/Muscat',start:'09:00',end:'19:00',nowUtc:atTenMuscat}).reason).toBe('market_disabled');
    expect(evaluateCanonicalMarketWindow({marketEnabled:true,marketTimezone:'Asia/Muscat',start:'09:00',end:'19:00',nowUtc:atTenMuscat}).allowed).toBe(true);
    expect(evaluateCanonicalMarketWindow({marketEnabled:true,marketTimezone:'Asia/Muscat',start:'11:00',end:'18:00',nowUtc:atTenMuscat}).reason).toBe('outside_window');
  });

  it('classifies all extended writes as confirmation-required mutations', () => {
    for (const type of ['SET_DISCOUNT_POLICY','SET_MINIMUM_PRICE','SET_MARKET_STYLE','SET_MARKET_SEND_WINDOW','SET_AGENT_ENABLED','SET_AGENT_THRESHOLD','SET_COST_LIMIT','ACTIVATE_KILL_SWITCH'] as const) expect(MUTATING_COMMANDS.has(type)).toBe(true);
    expect(MUTATING_COMMANDS.has('SAFETY_BLOCK')).toBe(false);
    expect(MUTATING_COMMANDS.has('SHOW_MARKETS')).toBe(false);
  });
});
