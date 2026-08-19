import { PreviewCanvas } from '@/components/preview/PreviewCanvas';
import { generatePreview } from '@/lib/preview/engine';
import { evaluatePreviewQuality } from '@/lib/preview/quality';

export default function PreviewStudioPage() {
  const preview = generatePreview({
    businessName: 'Northstar Dental',
    vertical: 'dental',
    countryCode: 'OM',
    language: 'en',
    city: 'Muscat',
    services: ['Preventive Care', 'Cosmetic Dentistry', 'Smile Consultations'],
    whatsapp: '+96800000000',
    explicitRequest: true,
    intentScore: 75,
  });
  const quality = evaluatePreviewQuality(preview);

  return (
    <div>
      <div className="headerRow">
        <div>
          <h1>Preview Studio</h1>
          <p className="muted">Curated vertical templates, approval-first sending and a hard quality gate.</p>
        </div>
        <span className="status">Quality {quality.score}/100 · {quality.passed ? 'PASS' : 'BLOCK'}</span>
      </div>
      <div style={{ marginTop: 24 }}><PreviewCanvas preview={preview} /></div>
    </div>
  );
}
