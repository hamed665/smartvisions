import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const releaseMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0059_owner_release_human_takeover.sql'), 'utf8');
const releaseHardening = readFileSync(resolve(process.cwd(), 'supabase/migrations/0060_harden_owner_release_human_takeover.sql'), 'utf8');
const takeoverMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/0062_owner_takeover_and_manual_reply_guards.sql'), 'utf8');
const actions = readFileSync(resolve(process.cwd(), 'app/management-actions.ts'), 'utf8');
const controlRoute = readFileSync(resolve(process.cwd(), 'app/api/conversations/[id]/control/route.ts'), 'utf8');
const liveConsole = readFileSync(resolve(process.cwd(), 'app/conversations/[id]/live-conversation.tsx'), 'utf8');

describe('owner human-takeover release', () => {
  it('is one atomic DB operation with owner verification and row locks', () => {
    expect(releaseMigration).toContain("om.role = 'OWNER'");
    expect(releaseMigration.match(/for update;/g)?.length).toBe(2);
    expect(releaseMigration).toContain('update public.leads');
    expect(releaseMigration).toContain('update public.sales_conversations');
    expect(releaseMigration).toContain("'RELEASE_HUMAN_TAKEOVER'");
    expect(releaseHardening).toContain('security invoker');
    expect(releaseHardening).toContain('revoke all on function public.release_human_takeover(uuid, uuid) from public');
    expect(releaseHardening).toContain('revoke all on function public.release_human_takeover(uuid, uuid) from anon');
    expect(releaseHardening).toContain('grant execute on function public.release_human_takeover(uuid, uuid) to authenticated');
  });

  it('fails closed for terminal states and never replays an old message', () => {
    expect(releaseMigration).toContain("v_conversation.stage in ('WON','LOST','DO_NOT_CONTACT','SPAM')");
    expect(releaseMigration).toContain("v_lead.status in ('WON','LOST','DO_NOT_CONTACT')");
    expect(releaseMigration).not.toMatch(/conversation_messages\s+set|outreach_messages\s+set|approved_send|provider/i);
  });

  it('resumes both linked automation states rather than only changing a UI flag', () => {
    expect(releaseMigration).toContain("agent_mode = 'AUTO'");
    expect(releaseMigration).toContain('requires_human = false');
    expect(releaseMigration).toContain("stage = case when stage = 'NEEDS_HUMAN' then 'ACTIVE' else stage end");
    expect(releaseMigration).toContain("awaiting_party = 'NONE'");
    expect(actions).toContain("rpc('release_human_takeover'");
    expect(controlRoute).toContain("action === 'TAKEOVER' ? 'claim_human_takeover' : 'release_human_takeover'");
  });

  it('claims only the linked conversation and lead with owner verification and locks', () => {
    expect(takeoverMigration).toContain('create or replace function public.claim_human_takeover');
    expect(takeoverMigration).toContain("om.role = 'OWNER'");
    expect(takeoverMigration.match(/for update;/g)?.length).toBe(2);
    expect(takeoverMigration).toContain("set agent_mode = 'HUMAN'");
    expect(takeoverMigration).toContain("requires_human = true");
    expect(takeoverMigration).toContain("awaiting_party = 'HUMAN'");
    expect(takeoverMigration).toContain("'CLAIM_HUMAN_TAKEOVER'");
    expect(takeoverMigration).toContain('security invoker');
    expect(takeoverMigration).toContain('revoke all on function public.claim_human_takeover(uuid, uuid) from anon');
    expect(takeoverMigration).toContain('grant execute on function public.claim_human_takeover(uuid, uuid) to authenticated');
  });

  it('exposes per-conversation Take Over and Resume controls only to an editable nonterminal chat', () => {
    expect(liveConsole).toContain("const terminal = ['WON', 'LOST', 'DO_NOT_CONTACT', 'SPAM']");
    expect(liveConsole).toContain("snapshot.editable && !fullOwnerTakeover");
    expect(liveConsole).toContain("snapshot.editable && fullOwnerTakeover");
    expect(liveConsole).toContain('Stop AI · Take Over');
    expect(liveConsole).toContain('Resume AI');
    expect(liveConsole).toContain('No older message was replayed.');
  });
});
