import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PANEL_PARITY_ACTION_NAMES } from '../lib/telegram/panel-parity-types';

const PANEL_ACTIONS = new Set<string>(PANEL_PARITY_ACTION_NAMES);

const CLASSIFICATION: Record<string, Record<string, string>> = {
  'app/booking/availability-actions.ts': {
    configureBookingAvailabilityCalendar:'SPECIALIZED:BOOKING_AVAILABILITY',
    createBookingAvailabilityHold:'SPECIALIZED:BOOKING_AVAILABILITY',
    releaseBookingAvailabilityHold:'SPECIALIZED:BOOKING_AVAILABILITY',
  },
  'app/booking/lifecycle-actions.ts': {
    createBookingRequest:'SPECIALIZED:BOOKING_LIFECYCLE',
    holdBookingRequest:'SPECIALIZED:BOOKING_LIFECYCLE',
    confirmBooking:'SPECIALIZED:BOOKING_LIFECYCLE',
    rescheduleBooking:'SPECIALIZED:BOOKING_LIFECYCLE',
    cancelBooking:'SPECIALIZED:BOOKING_LIFECYCLE',
    finalizeBooking:'SPECIALIZED:BOOKING_LIFECYCLE',
  },
  'app/business-os-actions.ts': {
    bootstrapCanonicalOperatingHierarchy:'SPECIALIZED:BUSINESS_OS_HIERARCHY_BOOTSTRAP',
    bootstrapCanonicalTenant:'SPECIALIZED:BUSINESS_OS_TENANT_BOOTSTRAP',
    createCanonicalBusiness:'SPECIALIZED:BUSINESS_OS_TENANT_BOOTSTRAP',
    prepareCommunicationPlaneProjection:'SPECIALIZED:CHATWOOT_TENANT_PROJECTION_PREPARE',
    provisionCommunicationPlaneAccount:'SPECIALIZED:CHATWOOT_EXTERNAL_ACCOUNT_PROVISION',
    provisionCommunicationPlaneApiInbox:'SPECIALIZED:CHATWOOT_API_INBOX_PROVISION',
    provisionCommunicationPlaneOwnerAccess:'SPECIALIZED:CHATWOOT_OWNER_ACCESS_PROVISION',
    provisionCommunicationPlaneTeam:'SPECIALIZED:CHATWOOT_TEAM_PROVISION',
    reconcileCommunicationPlaneScopedAccess:'SPECIALIZED:CHATWOOT_SCOPED_ACCESS_RECONCILE',
    reduceCommunicationPlaneScopedAssignment:'SPECIALIZED:CHATWOOT_EXTERNAL_FIRST_SCOPE_REDUCTION',
  },
  'app/control-center-actions.ts': {
    updateService:'service.update', createService:'service.create',
    updateServiceBookingCatalog:'SPECIALIZED:BOOKING_CATALOG',
    createBookingResource:'SPECIALIZED:BOOKING_CATALOG',
    updateBookingResource:'SPECIALIZED:BOOKING_CATALOG',
    updatePrice:'price.update', updateMarket:'market.update', updateAgent:'agent.update', updateApprovalRule:'approval.require',
  },
  'app/customer-success/customer-success-actions.ts': {
    acceptCustomerSuccessTask:'SPECIALIZED:CUSTOMER_SUCCESS_GOVERNANCE',
    recordCustomerLoyalty:'SPECIALIZED:CUSTOMER_SUCCESS_GOVERNANCE',
    recordCustomerReferralAction:'SPECIALIZED:CUSTOMER_SUCCESS_GOVERNANCE',
    transitionCustomerReferralAction:'SPECIALIZED:CUSTOMER_SUCCESS_GOVERNANCE',
    rewardCustomerReferral:'SPECIALIZED:CUSTOMER_SUCCESS_GOVERNANCE',
    classifyCustomerSuccessLifecycleCampaign:'SPECIALIZED:CUSTOMER_SUCCESS_GOVERNANCE',
  },
  'app/daily-target-actions.ts': {
    setDailyOutreachTarget:'SPECIALIZED:DAILY_OUTREACH_TARGET',
  },
  'app/marketing-campaign-actions.ts': {
    createMarketingCampaign:'SPECIALIZED:MARKETING_CAMPAIGN_GOVERNANCE',
    upsertMarketingCampaignVariant:'SPECIALIZED:MARKETING_CAMPAIGN_GOVERNANCE',
    transitionMarketingCampaign:'SPECIALIZED:MARKETING_CAMPAIGN_GOVERNANCE',
    recordMarketingCampaignConversion:'SPECIALIZED:MARKETING_CAMPAIGN_GOVERNANCE',
  },
  'app/marketing-consent-actions.ts': {
    recordMarketingPreference:'SPECIALIZED:MARKETING_CONSENT_GOVERNANCE',
  },
  'app/notification-actions.ts': {
    saveNotificationPreferences:'SPECIALIZED:AUTOMATION_NOTIFICATIONS',
    markNotificationRead:'SPECIALIZED:AUTOMATION_NOTIFICATIONS',
    acknowledgeNotification:'SPECIALIZED:AUTOMATION_NOTIFICATIONS',
  },
  'app/owner-copilot-actions.ts': {
    createOwnerCopilotTask:'SPECIALIZED:OWNER_COPILOT_ACTION_AUTHORITY',
    updateOwnerCopilotTask:'SPECIALIZED:OWNER_COPILOT_ACTION_AUTHORITY',
    updateOwnerCopilotDeal:'SPECIALIZED:OWNER_COPILOT_ACTION_AUTHORITY',
  },
  'app/management-actions.ts': {
    updateSystemControls:'SPECIALIZED:SAFE_CONTROLS',
    createCampaign:'campaign.create', updateCampaign:'campaign.update', updateOutreachPolicy:'outreach.update',
    createMessageTemplate:'template.create', updateMessageTemplate:'template.update',
    createAutomationRule:'automation.create', updateAutomationRule:'automation.update',
    saveAutomationRuleDraft:'SPECIALIZED:AUTOMATION_WORKFLOW_MODEL',
    publishAutomationRule:'SPECIALIZED:AUTOMATION_WORKFLOW_MODEL',
    setAutomationRuleEnabled:'SPECIALIZED:AUTOMATION_WORKFLOW_MODEL',
    updateIntegration:'integration.update', updateOrganizationSettings:'organization.update',
    createKnowledge:'CANONICAL_ALIAS:knowledge.publish', createPromptVersion:'CANONICAL_ALIAS:prompt.publish',
    updateLead:'lead.update', addSuppression:'suppression.add', updatePortfolioItem:'portfolio.update', updatePreviewTemplate:'preview_template.update',
    approveMessage:'SPECIALIZED:/approve', rejectMessage:'SPECIALIZED:/reject',
    delegateMessageApproval:'SPECIALIZED:AUTOMATION_APPROVAL',
    reconcileApprovalDeadlines:'SPECIALIZED:AUTOMATION_APPROVAL',
    updateConversation:'conversation.update',
    releaseHumanTakeover:'SPECIALIZED:OWNER_RELEASE',
  },
  'app/extended-actions.ts': {
    updateLocaleProfile:'locale.update', updateMailbox:'mailbox.update', updateMessageVariant:'variant.update', createPrice:'price.create', createMarket:'market.create',
    createPortfolioItem:'portfolio.create', createPreviewTemplate:'preview_template.create', deleteSuppression:'BLOCKED:DNC_BYPASS',
  },
  'app/cost-actions.ts': {
    runOpenAiHealthCheck:'openai.health', updateCostGuardSettings:'cost.update',
  },
  'app/founder/capital-actions.ts': {
    saveFounderCapTableEntry:'SPECIALIZED:FOUNDER_CAPITAL',
    archiveFounderCapTableEntry:'SPECIALIZED:FOUNDER_CAPITAL',
    saveFounderDilutionScenario:'SPECIALIZED:FOUNDER_CAPITAL',
    archiveFounderDilutionScenario:'SPECIALIZED:FOUNDER_CAPITAL',
    saveFounderTermSheet:'SPECIALIZED:FOUNDER_CAPITAL',
    saveFounderDueDiligenceItem:'SPECIALIZED:FOUNDER_CAPITAL',
  },
  'app/founder/finance-actions.ts': {
    recordCompanyFinancialSnapshot:'SPECIALIZED:FOUNDER_FINANCE',
    saveFounderFinanceScenario:'SPECIALIZED:FOUNDER_FINANCE',
    archiveFounderFinanceScenario:'SPECIALIZED:FOUNDER_FINANCE',
  },
  'app/founder/investor-actions.ts': {
    saveFounderFundraisingRound:'SPECIALIZED:FOUNDER_INVESTOR',
    recordFounderInvestorResearchCandidate:'SPECIALIZED:FOUNDER_INVESTOR',
    ensureFounderFundraisingPipeline:'SPECIALIZED:FOUNDER_INVESTOR',
    confirmFounderInvestorCandidateToCrm:'SPECIALIZED:FOUNDER_INVESTOR',
    createFounderInvestorPipelineEntry:'SPECIALIZED:FOUNDER_INVESTOR',
    moveFounderInvestorDealStage:'SPECIALIZED:FOUNDER_INVESTOR',
  },
  'app/founder/strategy-actions.ts': {
    saveFounderStrategicGoal:'SPECIALIZED:FOUNDER_STRATEGY',
    saveFounderKeyResult:'SPECIALIZED:FOUNDER_STRATEGY',
    saveFounderMarketResearchItem:'SPECIALIZED:FOUNDER_STRATEGY',
    saveFounderBoardReport:'SPECIALIZED:FOUNDER_STRATEGY',
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
  'app/leads/scoring-actions.ts': {
    recomputeLeadEngagement:'SPECIALIZED:SALES_SCORING_GOVERNANCE',
    setLeadScoreOverride:'SPECIALIZED:SALES_SCORING_GOVERNANCE',
    clearLeadScoreOverride:'SPECIALIZED:SALES_SCORING_GOVERNANCE',
  },
  'app/telegram-customer-actions.ts': {
    connectTelegramCustomerChannel:'SPECIALIZED:TELEGRAM_CUSTOMER_CHANNEL_CONNECT',
  },
  'app/versioned-intelligence-actions.ts': {
    createKnowledge:'knowledge.publish',
    createPromptVersion:'prompt.publish',
    configurePromptRollout:'SPECIALIZED:AI_PROMPT_CONTROL',
    setActivePromptVersion:'SPECIALIZED:AI_PROMPT_CONTROL',
  },
  'app/payments/provider-actions.ts': {
    configurePaymentProviderV1:'SPECIALIZED:PAYMENT_EXTENSION',
    createPaymentLinkV1:'SPECIALIZED:PAYMENT_EXTENSION',
    executePaymentRefundV1:'SPECIALIZED:PAYMENT_EXTENSION',
  },
  'app/preview-actions.ts': {
    generateControlledPreviewPilot:'preview.generate_pilot', approvePreview:'preview.approve', markPreviewSent:'preview.mark_sent', markControlledPreviewShared:'preview.mark_internal_shared',
  },
  'app/whatsapp-pilot-actions.ts': {
    processLatestWhatsAppInboundPilot:'whatsapp.process_pilot',
    sendApprovedWhatsAppCatalogPilot:'whatsapp.send_approved_pilot',
  },
  'app/whatsapp-opt-in-actions.ts': {
    recordWhatsAppMarketingOptIn:'SPECIALIZED:VERIFIED_WHATSAPP_OPT_IN',
    recordWhatsAppMarketingOptOut:'SPECIALIZED:WHATSAPP_OPT_OUT',
    sendApprovedWhatsAppOptInFirstTouch:'SPECIALIZED:OWNER_APPROVED_OPT_IN_SEND',
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
    expect(CLASSIFICATION['app/management-actions.ts'].delegateMessageApproval).toBe('SPECIALIZED:AUTOMATION_APPROVAL');
    expect(CLASSIFICATION['app/management-actions.ts'].reconcileApprovalDeadlines).toBe('SPECIALIZED:AUTOMATION_APPROVAL');
    expect(CLASSIFICATION['app/management-actions.ts'].releaseHumanTakeover).toBe('SPECIALIZED:OWNER_RELEASE');
    expect(CLASSIFICATION['app/management-actions.ts'].saveAutomationRuleDraft).toBe('SPECIALIZED:AUTOMATION_WORKFLOW_MODEL');
    expect(CLASSIFICATION['app/management-actions.ts'].publishAutomationRule).toBe('SPECIALIZED:AUTOMATION_WORKFLOW_MODEL');
    expect(CLASSIFICATION['app/management-actions.ts'].setAutomationRuleEnabled).toBe('SPECIALIZED:AUTOMATION_WORKFLOW_MODEL');
    expect(CLASSIFICATION['app/notification-actions.ts'].saveNotificationPreferences).toBe('SPECIALIZED:AUTOMATION_NOTIFICATIONS');
    expect(CLASSIFICATION['app/notification-actions.ts'].markNotificationRead).toBe('SPECIALIZED:AUTOMATION_NOTIFICATIONS');
    expect(CLASSIFICATION['app/notification-actions.ts'].acknowledgeNotification).toBe('SPECIALIZED:AUTOMATION_NOTIFICATIONS');
    expect(CLASSIFICATION['app/control-center-actions.ts'].updateServiceBookingCatalog).toBe('SPECIALIZED:BOOKING_CATALOG');
    expect(CLASSIFICATION['app/control-center-actions.ts'].createBookingResource).toBe('SPECIALIZED:BOOKING_CATALOG');
    expect(CLASSIFICATION['app/control-center-actions.ts'].updateBookingResource).toBe('SPECIALIZED:BOOKING_CATALOG');
    expect(CLASSIFICATION['app/founder/capital-actions.ts'].saveFounderCapTableEntry).toBe('SPECIALIZED:FOUNDER_CAPITAL');
    expect(CLASSIFICATION['app/founder/capital-actions.ts'].archiveFounderCapTableEntry).toBe('SPECIALIZED:FOUNDER_CAPITAL');
    expect(CLASSIFICATION['app/founder/capital-actions.ts'].saveFounderDilutionScenario).toBe('SPECIALIZED:FOUNDER_CAPITAL');
    expect(CLASSIFICATION['app/founder/capital-actions.ts'].archiveFounderDilutionScenario).toBe('SPECIALIZED:FOUNDER_CAPITAL');
    expect(CLASSIFICATION['app/founder/capital-actions.ts'].saveFounderTermSheet).toBe('SPECIALIZED:FOUNDER_CAPITAL');
    expect(CLASSIFICATION['app/founder/capital-actions.ts'].saveFounderDueDiligenceItem).toBe('SPECIALIZED:FOUNDER_CAPITAL');
    expect(CLASSIFICATION['app/founder/finance-actions.ts'].recordCompanyFinancialSnapshot).toBe('SPECIALIZED:FOUNDER_FINANCE');
    expect(CLASSIFICATION['app/founder/finance-actions.ts'].saveFounderFinanceScenario).toBe('SPECIALIZED:FOUNDER_FINANCE');
    expect(CLASSIFICATION['app/founder/finance-actions.ts'].archiveFounderFinanceScenario).toBe('SPECIALIZED:FOUNDER_FINANCE');
    expect(CLASSIFICATION['app/founder/investor-actions.ts'].saveFounderFundraisingRound).toBe('SPECIALIZED:FOUNDER_INVESTOR');
    expect(CLASSIFICATION['app/founder/investor-actions.ts'].recordFounderInvestorResearchCandidate).toBe('SPECIALIZED:FOUNDER_INVESTOR');
    expect(CLASSIFICATION['app/founder/investor-actions.ts'].ensureFounderFundraisingPipeline).toBe('SPECIALIZED:FOUNDER_INVESTOR');
    expect(CLASSIFICATION['app/founder/investor-actions.ts'].confirmFounderInvestorCandidateToCrm).toBe('SPECIALIZED:FOUNDER_INVESTOR');
    expect(CLASSIFICATION['app/founder/investor-actions.ts'].createFounderInvestorPipelineEntry).toBe('SPECIALIZED:FOUNDER_INVESTOR');
    expect(CLASSIFICATION['app/founder/investor-actions.ts'].moveFounderInvestorDealStage).toBe('SPECIALIZED:FOUNDER_INVESTOR');
    expect(CLASSIFICATION['app/founder/strategy-actions.ts'].saveFounderStrategicGoal).toBe('SPECIALIZED:FOUNDER_STRATEGY');
    expect(CLASSIFICATION['app/founder/strategy-actions.ts'].saveFounderKeyResult).toBe('SPECIALIZED:FOUNDER_STRATEGY');
    expect(CLASSIFICATION['app/founder/strategy-actions.ts'].saveFounderMarketResearchItem).toBe('SPECIALIZED:FOUNDER_STRATEGY');
    expect(CLASSIFICATION['app/founder/strategy-actions.ts'].saveFounderBoardReport).toBe('SPECIALIZED:FOUNDER_STRATEGY');
    expect(CLASSIFICATION['app/booking/availability-actions.ts'].configureBookingAvailabilityCalendar).toBe('SPECIALIZED:BOOKING_AVAILABILITY');
    expect(CLASSIFICATION['app/booking/availability-actions.ts'].createBookingAvailabilityHold).toBe('SPECIALIZED:BOOKING_AVAILABILITY');
    expect(CLASSIFICATION['app/booking/availability-actions.ts'].releaseBookingAvailabilityHold).toBe('SPECIALIZED:BOOKING_AVAILABILITY');

    expect(CLASSIFICATION['app/booking/lifecycle-actions.ts'].createBookingRequest).toBe('SPECIALIZED:BOOKING_LIFECYCLE');
    expect(CLASSIFICATION['app/booking/lifecycle-actions.ts'].holdBookingRequest).toBe('SPECIALIZED:BOOKING_LIFECYCLE');
    expect(CLASSIFICATION['app/booking/lifecycle-actions.ts'].confirmBooking).toBe('SPECIALIZED:BOOKING_LIFECYCLE');
    expect(CLASSIFICATION['app/booking/lifecycle-actions.ts'].rescheduleBooking).toBe('SPECIALIZED:BOOKING_LIFECYCLE');
    expect(CLASSIFICATION['app/booking/lifecycle-actions.ts'].cancelBooking).toBe('SPECIALIZED:BOOKING_LIFECYCLE');
    expect(CLASSIFICATION['app/booking/lifecycle-actions.ts'].finalizeBooking).toBe('SPECIALIZED:BOOKING_LIFECYCLE');


    expect(CLASSIFICATION['app/daily-target-actions.ts'].setDailyOutreachTarget).toBe('SPECIALIZED:DAILY_OUTREACH_TARGET');
    expect(CLASSIFICATION['app/business-os-actions.ts'].bootstrapCanonicalOperatingHierarchy).toBe('SPECIALIZED:BUSINESS_OS_HIERARCHY_BOOTSTRAP');
    expect(CLASSIFICATION['app/business-os-actions.ts'].bootstrapCanonicalTenant).toBe('SPECIALIZED:BUSINESS_OS_TENANT_BOOTSTRAP');
    expect(CLASSIFICATION['app/business-os-actions.ts'].createCanonicalBusiness).toBe('SPECIALIZED:BUSINESS_OS_TENANT_BOOTSTRAP');
    expect(CLASSIFICATION['app/business-os-actions.ts'].prepareCommunicationPlaneProjection).toBe('SPECIALIZED:CHATWOOT_TENANT_PROJECTION_PREPARE');
    expect(CLASSIFICATION['app/business-os-actions.ts'].provisionCommunicationPlaneAccount).toBe('SPECIALIZED:CHATWOOT_EXTERNAL_ACCOUNT_PROVISION');
    expect(CLASSIFICATION['app/business-os-actions.ts'].provisionCommunicationPlaneApiInbox).toBe('SPECIALIZED:CHATWOOT_API_INBOX_PROVISION');
    expect(CLASSIFICATION['app/business-os-actions.ts'].provisionCommunicationPlaneOwnerAccess).toBe('SPECIALIZED:CHATWOOT_OWNER_ACCESS_PROVISION');
    expect(CLASSIFICATION['app/business-os-actions.ts'].provisionCommunicationPlaneTeam).toBe('SPECIALIZED:CHATWOOT_TEAM_PROVISION');
    expect(CLASSIFICATION['app/business-os-actions.ts'].reconcileCommunicationPlaneScopedAccess).toBe('SPECIALIZED:CHATWOOT_SCOPED_ACCESS_RECONCILE');
    expect(CLASSIFICATION['app/business-os-actions.ts'].reduceCommunicationPlaneScopedAssignment).toBe('SPECIALIZED:CHATWOOT_EXTERNAL_FIRST_SCOPE_REDUCTION');
    expect(CLASSIFICATION['app/whatsapp-opt-in-actions.ts'].recordWhatsAppMarketingOptIn).toBe('SPECIALIZED:VERIFIED_WHATSAPP_OPT_IN');
    expect(CLASSIFICATION['app/whatsapp-opt-in-actions.ts'].recordWhatsAppMarketingOptOut).toBe('SPECIALIZED:WHATSAPP_OPT_OUT');
    expect(CLASSIFICATION['app/whatsapp-opt-in-actions.ts'].sendApprovedWhatsAppOptInFirstTouch).toBe('SPECIALIZED:OWNER_APPROVED_OPT_IN_SEND');
  });
});
