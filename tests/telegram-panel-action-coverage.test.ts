import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_PARITY_ACTION_NAMES } from '../lib/telegram/panel-parity-types';

const PANEL_ACTIONS = new Set<string>(PANEL_PARITY_ACTION_NAMES);

const CLASSIFICATION: Record<string, Record<string, string>> = {
  'app/control-center-actions.ts': {
    updateService:'service.update', createService:'service.create', updatePrice:'price.update', updateMarket:'market.update', updateAgent:'agent.update', updateApprovalRule:'approval.require',
  },
  'app/management-actions.ts': {
    updateSystemControls:'SPECIALIZED:SAFE_CONTROLS',
    createCampaign:'campaign.create', updateCampaign:'campaign.update', updateOutreachPolicy:'outreach.update',
    createMessageTemplate:'template.create', updateMessageTemplate:'template.update',
    createAutomationRule:'automation.create', updateIntegration:'integration.update', updateOrganizationSettings:'organization.update', updateAutomationRule:'automation.update',
    createKnowledge:'CANONICAL_ALIAS:knowledge.publish', createPromptVersion:'CANONICAL_ALIAS:prompt.publish',
    updateLead:'lead.update', addSuppression:'suppression.add', updatePortfolioItem:'portfolio.update', updatePreviewTemplate:'preview_template.update',
    approveMessage:'SPECIALIZED:/approve', rejectMessage:'SPECIALIZED:/reject', updateConversation:'conversation.update',
  },
  'app/extended-actions.ts': {
    updateLocaleProfile:'locale.update', updateMailbox:'mailbox.update', updateMessageVariant:'variant.update', createPrice:'price.create', createMarket:'market.create',
    createPortfolioItem:'portfolio.create', createPreviewTemplate:'preview_template.create', deleteSuppression:'BLOCKED:DNC_BYPASS',
  },
  'app/cost-actions.ts': {
    runOpenAiHealthCheck:'openai.health', updateCostGuardSettings:'cost.update',
  },
  'app/growth-opportunity-actions.ts': {
    routeCachedGrowthOpportunities:'growth.rescore', recordGrowthSocialAssessment:'growth.social_review', promoteHighPrecisionGrowthCandidates:'growth.promote',
  },
  'app/audit-actions.ts': {
    runDeterministicWebsiteAudit:'website.audit',
  },
  'app/hunter-actions.ts': {
    runGooglePlacesControlledSample:'hunter.sample', enrichGooglePlaceCandidate:'hunter.enrich',
  },
  'app/hunter-batch-actions.ts': {
    qualifyGooglePlacesPriorityBatch:'hunter.batch',
  },
  'app/integration-health-actions.ts': {
    verifyEmailIntegration:'integration.email_verify', verifyCrawl4AiIntegration:'integration.crawl4ai_verify',
  },
  'app/intelligence-actions.ts': {
    refreshGoogleBusinessIntelligence:'google.refresh',
  },
  'app/versioned-intelligence-actions.ts': {
    createKnowledge:'knowledge.publish', createPromptVersion:'prompt.publish',
  },
  'app/preview-actions.ts': {
    generateControlledPreviewPilot:'preview.generate_pilot', approvePreview:'preview.approve', markPreviewSent:'preview.mark_sent', markControlledPreviewShared:'preview.mark_internal_shared',
  },
  'app/whatsapp-pilot-actions.ts': {
    processLatestWhatsAppInboundPilot:'whatsapp.process_pilot',
    sendApprovedWhatsAppCatalogPilot:'whatsapp.send_approved_pilot',
  },
  'app/whatsapp-verification-actions.ts': {
    verifyWhatsAppIntegration:'whatsapp.verify', transcribeLatestWhatsAppVoicePilot:'whatsapp.voice_transcribe',
  },
};

function exportedAsyncFunctions(path: string) {
  const source = readFileSync(resolve(process.cwd(), path), 'utf8');
  return [...source.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g)].map(match => match[1]).sort();
}

function actionFiles(directory: string): string[] {
  const root = resolve(process.cwd(), directory);
  const walk = (current: string): string[] => readdirSync(current, { withFileTypes:true }).flatMap(entry => {
    const full = join(current, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!entry.isFile() || !entry.name.endsWith('-actions.ts')) return [];
    return [relative(process.cwd(), full).replaceAll('\\','/')];
  });
  return walk(root).sort();
}

describe('Control Center ↔ Telegram action coverage', () => {
  it('classifies every app *-actions.ts module so future panel actions cannot silently drift away from Telegram', () => {
    expect(Object.keys(CLASSIFICATION).sort()).toEqual(actionFiles('app'));
  });

  for (const [path, classified] of Object.entries(CLASSIFICATION)) {
    it(`classifies every exported Server Action in ${path}`, () => {
      expect(Object.keys(classified).sort()).toEqual(exportedAsyncFunctions(path));
    });
  }

  it('maps every executable parity classification to a registered PANEL_ACTION', () => {
    for (const classified of Object.values(CLASSIFICATION)) {
      for (const target of Object.values(classified)) {
        if (target.startsWith('BLOCKED:') || target.startsWith('SPECIALIZED:') || target.startsWith('CANONICAL_ALIAS:')) continue;
        expect(PANEL_ACTIONS.has(target), `${target} must be registered`).toBe(true);
      }
    }
  });

  it('documents the intentionally blocked or specialized exceptions instead of silently omitting them', () => {
    expect(CLASSIFICATION['app/extended-actions.ts'].deleteSuppression).toBe('BLOCKED:DNC_BYPASS');
    expect(CLASSIFICATION['app/management-actions.ts'].updateSystemControls).toBe('SPECIALIZED:SAFE_CONTROLS');
    expect(CLASSIFICATION['app/management-actions.ts'].approveMessage).toBe('SPECIALIZED:/approve');
    expect(CLASSIFICATION['app/management-actions.ts'].rejectMessage).toBe('SPECIALIZED:/reject');
  });
});
