import type { CrmLeadScoringRow } from '@/lib/crm/lead-scoring';
import { canMutateCrmLeadScoring } from '@/lib/crm/lead-scoring';
import {
  clearLeadScoreOverride,
  recomputeLeadEngagement,
  setLeadScoreOverride,
} from '@/app/leads/scoring-actions';

const value = (score: number | null) => score == null ? 'NOT MEASURED' : score + '/100';

export function LeadScoringPanel(props: {
  leadId: string;
  role: string;
  scoring: CrmLeadScoringRow;
}) {
  const { scoring } = props;
  const mutable = canMutateCrmLeadScoring(props.role);
  const suggestion = scoring.model_score_suggestion ?? null;

  return <section className="panel">
    <div className="headerRow">
      <div>
        <h2>Sales scoring governance</h2>
        <p className="muted">
          Smart Core keeps the deterministic base score authoritative. Manual override changes only the effective score,
          and AI/model suggestions stay advisory until a governed deterministic decision accepts new truth.
        </p>
      </div>
      <span className="status">Revision {scoring.scoring_revision}</span>
    </div>

    <section className="statsGrid fourStats">
      <article><span>Base opportunity</span><strong>{scoring.opportunity_score}/100</strong></article>
      <article><span>Effective score</span><strong>{scoring.effective_score}/100</strong></article>
      <article><span>Fit</span><strong>{value(scoring.fit_score)}</strong></article>
      <article><span>Engagement</span><strong>{value(scoring.engagement_score)}</strong></article>
    </section>

    <div className="healthList">
      <span>Intent <strong>{scoring.intent_score}/100</strong></span>
      <span>Source <strong>{scoring.scoring_source ?? 'LEGACY / NOT YET GOVERNED'}</strong></span>
      <span>Policy <strong>{scoring.scoring_policy_version ?? '—'}</strong></span>
      <span>Override <strong>{scoring.override_active ? 'ACTIVE' : scoring.manual_score_override != null ? 'EXPIRED' : 'NONE'}</strong></span>
    </div>

    {scoring.manual_score_override != null ? <div>
      <h3>Manual override evidence</h3>
      <p className="muted">
        Score {scoring.manual_score_override}/100 · Reason: {scoring.manual_score_override_reason ?? '—'}
        {scoring.manual_score_override_expires_at ? ' · Expires ' + scoring.manual_score_override_expires_at : ' · No expiry'}
      </p>
    </div> : null}

    {suggestion ? <div>
      <h3>Model suggestion · advisory only</h3>
      <p className="muted">
        {String(suggestion.provider ?? 'unknown provider')} / {String(suggestion.model ?? 'unknown model')}
        {' · version '}{String(suggestion.modelVersion ?? 'unknown')}
        {' · proposed opportunity '}{suggestion.opportunityScore == null ? '—' : String(suggestion.opportunityScore)}
        {' · fit '}{suggestion.fitScore == null ? '—' : String(suggestion.fitScore)}
        {' · intent '}{suggestion.intentScore == null ? '—' : String(suggestion.intentScore)}
        {' · engagement '}{suggestion.engagementScore == null ? '—' : String(suggestion.engagementScore)}
      </p>
      <p className="muted">This suggestion does not overwrite the canonical base score or an explicit human override.</p>
    </div> : null}

    <div className="settingsList">
      <form action={recomputeLeadEngagement} className="settingsRow">
        <input type="hidden" name="leadId" value={props.leadId}/>
        <input type="hidden" name="expectedRevision" value={scoring.scoring_revision}/>
        <div>
          <strong>Recompute engagement</strong>
          <span className="muted smallText">Uses only bounded conversation/reply/read-receipt evidence already owned by Smart Core.</span>
        </div>
        <button disabled={!mutable}>Recompute</button>
      </form>

      <form action={setLeadScoreOverride} className="settingsRow">
        <input type="hidden" name="leadId" value={props.leadId}/>
        <input type="hidden" name="expectedRevision" value={scoring.scoring_revision}/>
        <label>Override score<input name="overrideScore" type="number" min="0" max="100" required disabled={!mutable}/></label>
        <label className="wideField">Reason<input name="reason" maxLength={240} required disabled={!mutable}/></label>
        <label>Expires<input name="expiresAt" type="datetime-local" disabled={!mutable}/></label>
        <button disabled={!mutable}>Set override</button>
      </form>

      {scoring.manual_score_override != null ? <form action={clearLeadScoreOverride} className="settingsRow">
        <input type="hidden" name="leadId" value={props.leadId}/>
        <input type="hidden" name="expectedRevision" value={scoring.scoring_revision}/>
        <label className="wideField">Correction reason<input name="reason" maxLength={240} required disabled={!mutable}/></label>
        <button disabled={!mutable}>Clear override</button>
      </form> : null}
    </div>
  </section>;
}
