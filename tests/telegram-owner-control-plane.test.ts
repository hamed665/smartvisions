import { describe, expect, it } from 'vitest';
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

  it('parses discount, floor, tone, agent and cost mutations', () => {
    expect(parseTelegramOwnerCommand('/discount OM business_website 5 10')).toEqual({type:'SET_DISCOUNT_POLICY',countryCode:'OM',serviceQuery:'business_website',maxAutoDiscountPct:5,maxDiscountWithApprovalPct:10});
    expect(parseTelegramOwnerCommand('/minimum OM business_website 160')).toEqual({type:'SET_MINIMUM_PRICE',countryCode:'OM',serviceQuery:'business_website',minimumPrice:160});
    expect(parseTelegramOwnerCommand('/tone OM friendly_professional')).toEqual({type:'SET_MARKET_STYLE',countryCode:'OM',field:'tone',value:'friendly_professional'});
    expect(parseTelegramOwnerCommand('لحن عمان رو دوستانه و حرفه‌ای کن')).toEqual({type:'SET_MARKET_STYLE',countryCode:'OM',field:'tone',value:'friendly_professional'});
    expect(parseTelegramOwnerCommand('set Oman tone to friendly professional')).toEqual({type:'SET_MARKET_STYLE',countryCode:'OM',field:'tone',value:'friendly_professional'});
    expect(parseTelegramOwnerCommand('/agent secretary off')).toEqual({type:'SET_AGENT_ENABLED',agentQuery:'secretary',enabled:false});
    expect(parseTelegramOwnerCommand('/threshold secretary 0.8')).toEqual({type:'SET_AGENT_THRESHOLD',agentQuery:'secretary',threshold:0.8});
    expect(parseTelegramOwnerCommand('بودجه ماهانه رو 30 دلار کن')).toEqual({type:'SET_COST_LIMIT',key:'monthly_total_budget_usd',value:30});
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

  it('classifies all extended writes as confirmation-required mutations', () => {
    for (const type of ['SET_DISCOUNT_POLICY','SET_MINIMUM_PRICE','SET_MARKET_STYLE','SET_MARKET_SEND_WINDOW','SET_AGENT_ENABLED','SET_AGENT_THRESHOLD','SET_COST_LIMIT','ACTIVATE_KILL_SWITCH'] as const) {
      expect(MUTATING_COMMANDS.has(type)).toBe(true);
    }
    expect(MUTATING_COMMANDS.has('SAFETY_BLOCK')).toBe(false);
    expect(MUTATING_COMMANDS.has('SHOW_MARKETS')).toBe(false);
  });
});
