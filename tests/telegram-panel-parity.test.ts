import { describe, expect, it } from 'vitest';
import { parseTelegramOwnerCommand } from '../lib/telegram/parser';
import { PANEL_PARITY_ACTION_NAMES } from '../lib/telegram/panel-parity-types';

describe('Telegram Control Center parity parser', () => {
  it('shows the parity capabilities surface', () => {
    expect(parseTelegramOwnerCommand('/panel')).toEqual({ type:'SHOW_PANEL_CAPABILITIES' });
  });

  it('re-scores cached businesses through an explicit zero-cost shortcut', () => {
    expect(parseTelegramOwnerCommand('/rescore')).toEqual({ type:'PANEL_ACTION', action:'growth.rescore', args:{} });
    expect(parseTelegramOwnerCommand('بیزنس های cached رو دوباره امتیاز بده')).toEqual({ type:'PANEL_ACTION', action:'growth.rescore', args:{} });
  });

  it('promotes only through the explicit confirmed panel mutation path', () => {
    expect(parseTelegramOwnerCommand('/promote 7')).toEqual({ type:'PANEL_ACTION', action:'growth.promote', args:{limit:'7'} });
  });

  it('requires an evidence-bearing social review command', () => {
    expect(parseTelegramOwnerCommand('/socialreview 11111111-1111-1111-1111-111111111111 weak "posting has been inactive for weeks"')).toEqual({
      type:'PANEL_ACTION', action:'growth.social_review', args:{
        opportunityId:'11111111-1111-1111-1111-111111111111',
        quality:'WEAK',
        note:'posting has been inactive for weeks',
      },
    });
  });

  it('parses generic key/value Control Center actions without arbitrary JSON', () => {
    expect(parseTelegramOwnerCommand('/panel service.create id=seo_growth name="SEO Growth"')).toEqual({
      type:'PANEL_ACTION', action:'service.create', args:{id:'seo_growth',name:'SEO Growth'},
    });
  });

  it('normalizes boolean owner intent to the checkbox values reused Server Actions expect', () => {
    expect(parseTelegramOwnerCommand('/panel approval.require id=rule-1 requires_approval=true')).toEqual({
      type:'PANEL_ACTION', action:'approval.require', args:{id:'rule-1',requires_approval:'on'},
    });
    expect(parseTelegramOwnerCommand('/panel service.update id=svc name="Service" enabled=false')).toEqual({
      type:'PANEL_ACTION', action:'service.update', args:{id:'svc',name:'Service',enabled:'off'},
    });
    expect(parseTelegramOwnerCommand('/panel market.update id=m enabled=true currency=OMR timezone=Asia/Muscat send_window_start=09:00 send_window_end=19:00 whatsapp_cold_enabled=false instagram_auto_cold_enabled=false')).toMatchObject({
      type:'PANEL_ACTION', action:'market.update', args:{enabled:'on',whatsapp_cold_enabled:'off',instagram_auto_cold_enabled:'off'},
    });
  });

  it('supports deterministic website audit shortcuts', () => {
    expect(parseTelegramOwnerCommand('/webaudit business abc')).toEqual({ type:'PANEL_ACTION', action:'website.audit', args:{businessId:'abc'} });
    expect(parseTelegramOwnerCommand('/webaudit lead xyz')).toEqual({ type:'PANEL_ACTION', action:'website.audit', args:{leadId:'xyz'} });
  });

  it('registers the major panel domains', () => {
    expect(PANEL_PARITY_ACTION_NAMES).toContain('growth.rescore');
    expect(PANEL_PARITY_ACTION_NAMES).toContain('hunter.batch');
    expect(PANEL_PARITY_ACTION_NAMES).toContain('cost.update');
    expect(PANEL_PARITY_ACTION_NAMES).toContain('whatsapp.verify');
    expect(PANEL_PARITY_ACTION_NAMES).toContain('knowledge.publish');
  });
});
