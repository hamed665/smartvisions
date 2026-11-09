import { customerStudioScope, loadStudioKnowledge, type StudioQuery } from '@/lib/access/customer-studio';
import { StudioBadge, StudioEmpty, StudioHeading, studioLabel } from '../studio-ui';
import { StudioRehearsal } from './rehearsal';
import { StudioKnowledgeForm, StudioPublishButton, StudioRevisionForm } from './knowledge-form';

export const dynamic = 'force-dynamic';

export default async function CustomerAiPage({ searchParams }: { searchParams: Promise<StudioQuery> }) {
  const { businessId } = await searchParams;
  const scope = await customerStudioScope(businessId);
  const { business } = scope;
  const versions = await loadStudioKnowledge(scope);
  const manage = ['OWNER', 'ADMIN'].includes(business.organizationRole) && ['OWNER', 'ADMIN'].includes(business.businessRole);
  return <>
    <StudioHeading section="BUSINESS KNOWLEDGE" title="Assistant" description="Prepare the facts your business wants to publish and review each version." />
    <div className="studio-training">
      <section className="studio-panel">
        <div className="studio-panel-heading"><h2>Business profile</h2><StudioBadge>Review required</StudioBadge></div>
        {manage ? <StudioKnowledgeForm businessId={business.id} />
          : <StudioEmpty title="Knowledge is managed by your team" description="A business manager can add a source and publish a reviewed draft." />}
      </section>
      <section className="studio-panel">
        <div className="studio-panel-heading"><h2>Version history</h2></div>
        {!versions.length ? <StudioEmpty title="No business knowledge yet" description="Create a draft to review the source before publishing it." /> : versions.map(version => {
          const text = typeof version.payload?.text === 'string' ? version.payload.text : null;
          return <article className="studio-knowledge-item" key={version.id}>
            <details><summary><strong>{studioLabel(version.knowledge_key.replaceAll('-', ' '))} · v{version.version}</strong> <StudioBadge tone={version.active ? 'positive' : 'attention'}>{studioLabel(version.approval_status)}</StudioBadge></summary>
              {text && <p dir="auto">{text}</p>}
              {manage && version.knowledge_key === 'studio-business-profile' && version.approval_status === 'PENDING_REVIEW' &&
                <>
                  {text && <StudioRevisionForm businessId={business.id} versionId={version.id} original={text} />}
                  <StudioPublishButton businessId={business.id} versionId={version.id} />
                </>}
            </details>
          </article>;
        })}
      </section>
    </div>
    {manage && versions.some(version => version.active && version.approval_status === 'APPROVED') &&
      <section className="studio-panel studio-recent">
        <div className="studio-panel-heading"><h2>Rehearse a conversation</h2><StudioBadge>Private test</StudioBadge></div>
        <StudioRehearsal businessId={business.id} />
      </section>}
  </>;
}
