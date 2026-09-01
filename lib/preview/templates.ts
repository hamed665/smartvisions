import type { PreviewVertical } from './types';

export type PreviewTemplate = {
  id: string;
  vertical: PreviewVertical;
  family: string;
  mood: string;
  theme: string;
  tags: string[];
  palette: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    accentText: string;
    line: string;
  };
  display: 'sans' | 'editorial';
  heroLayout: 'split' | 'centered' | 'cinematic' | 'editorial';
  navStyle: 'minimal' | 'floating' | 'transparent';
  mobileCta: 'sticky' | 'inline';
  radius: number;
  maxWidth: number;
  heroMinHeight: number;
  density: 'airy' | 'balanced';
  sectionOrder: Array<'hero' | 'services' | 'proof' | 'gallery' | 'booking' | 'location' | 'offer'>;
  customerFacing: boolean;
  referenceYear: 2026;
};

const typography = {
  latin: 'manrope' as const,
  arabic: 'noto-sans-arabic' as const,
};

/**
 * Original Smart Visions templates informed by current 2026 design patterns:
 * editorial hierarchy, strong type, restrained motion, responsive systems,
 * mobile conversion CTAs and evidence-first content. No third-party template
 * code, copy or protected assets are bundled here.
 */
export const PREVIEW_TEMPLATE_LIBRARY: PreviewTemplate[] = [
  {
    id: 'clinical-ivory-2026', vertical: 'dental', family: 'clinical_editorial', mood: 'calm precise premium', theme: 'clinical-ivory', tags: ['clean','clinical','premium','bright'],
    palette: { background: '#F7F6F2', surface: '#FFFFFF', text: '#17201D', muted: '#66706C', accent: '#1F6254', accentText: '#FFFFFF', line: '#DDE3DF' },
    display: 'sans', heroLayout: 'split', navStyle: 'floating', mobileCta: 'sticky', radius: 26, maxWidth: 1240, heroMinHeight: 680, density: 'airy', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'clinical-midnight-2026', vertical: 'dental', family: 'clinical_luxury', mood: 'confident high-end clinical', theme: 'clinical-midnight', tags: ['dark','luxury','premium','modern'],
    palette: { background: '#0F1718', surface: '#172223', text: '#F3F5F2', muted: '#AAB5B0', accent: '#B8D7CC', accentText: '#10201C', line: '#2D3B3C' },
    display: 'sans', heroLayout: 'editorial', navStyle: 'transparent', mobileCta: 'sticky', radius: 22, maxWidth: 1240, heroMinHeight: 700, density: 'airy', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'clinic-trust-2026', vertical: 'clinic', family: 'healthcare_editorial', mood: 'clear reassuring modern', theme: 'clinic-trust', tags: ['health','clean','trust','bright'],
    palette: { background: '#F5F8F7', surface: '#FFFFFF', text: '#15201F', muted: '#667573', accent: '#235C62', accentText: '#FFFFFF', line: '#DAE4E2' },
    display: 'sans', heroLayout: 'split', navStyle: 'minimal', mobileCta: 'sticky', radius: 24, maxWidth: 1220, heroMinHeight: 660, density: 'airy', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'beauty-editorial-2026', vertical: 'beauty', family: 'beauty_editorial', mood: 'soft editorial luxury', theme: 'beauty-editorial', tags: ['beauty','editorial','warm','luxury'],
    palette: { background: '#F7F1EC', surface: '#FFFDFC', text: '#261D1A', muted: '#806F68', accent: '#713F35', accentText: '#FFFFFF', line: '#E7DCD5' },
    display: 'editorial', heroLayout: 'editorial', navStyle: 'floating', mobileCta: 'sticky', radius: 30, maxWidth: 1220, heroMinHeight: 720, density: 'airy', sectionOrder: ['hero','proof','services','gallery','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'salon-gallery-2026', vertical: 'salon', family: 'fashion_editorial', mood: 'fashion-forward refined', theme: 'salon-gallery', tags: ['fashion','editorial','gallery','premium'],
    palette: { background: '#F4F2EF', surface: '#FFFFFF', text: '#181716', muted: '#6E6964', accent: '#171717', accentText: '#FFFFFF', line: '#DDD8D2' },
    display: 'editorial', heroLayout: 'editorial', navStyle: 'transparent', mobileCta: 'sticky', radius: 20, maxWidth: 1260, heroMinHeight: 740, density: 'airy', sectionOrder: ['hero','proof','gallery','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'restaurant-cinematic-2026', vertical: 'restaurant', family: 'hospitality_cinematic', mood: 'immersive rich contemporary', theme: 'restaurant-cinematic', tags: ['restaurant','dark','cinematic','premium'],
    palette: { background: '#161511', surface: '#201E19', text: '#F4F0E6', muted: '#B8B09F', accent: '#D3A75C', accentText: '#1B160D', line: '#38342B' },
    display: 'editorial', heroLayout: 'cinematic', navStyle: 'transparent', mobileCta: 'sticky', radius: 20, maxWidth: 1280, heroMinHeight: 760, density: 'balanced', sectionOrder: ['hero','proof','offer','services','gallery','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'cafe-warm-2026', vertical: 'cafe', family: 'warm_hospitality', mood: 'crafted warm contemporary', theme: 'cafe-warm', tags: ['cafe','warm','crafted','editorial'],
    palette: { background: '#F1EAE0', surface: '#FBF8F2', text: '#282019', muted: '#786A5E', accent: '#75513A', accentText: '#FFFFFF', line: '#DED2C4' },
    display: 'editorial', heroLayout: 'split', navStyle: 'floating', mobileCta: 'sticky', radius: 26, maxWidth: 1220, heroMinHeight: 700, density: 'airy', sectionOrder: ['hero','proof','offer','services','gallery','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'hospitality-resort-2026', vertical: 'hospitality', family: 'hospitality_editorial', mood: 'quiet aspirational luxury', theme: 'hospitality-resort', tags: ['hotel','hospitality','luxury','editorial'],
    palette: { background: '#F5F1E9', surface: '#FFFDF9', text: '#18211F', muted: '#69736F', accent: '#355B51', accentText: '#FFFFFF', line: '#DDE1DB' },
    display: 'editorial', heroLayout: 'cinematic', navStyle: 'transparent', mobileCta: 'sticky', radius: 18, maxWidth: 1300, heroMinHeight: 780, density: 'airy', sectionOrder: ['hero','proof','gallery','offer','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'pet-care-2026', vertical: 'pet_clinic', family: 'friendly_clinical', mood: 'trusted warm friendly', theme: 'pet-care', tags: ['pet','friendly','clinic','warm'],
    palette: { background: '#F4F6F1', surface: '#FFFFFF', text: '#1E2822', muted: '#6C766F', accent: '#35684F', accentText: '#FFFFFF', line: '#DCE4DD' },
    display: 'sans', heroLayout: 'split', navStyle: 'floating', mobileCta: 'sticky', radius: 30, maxWidth: 1200, heroMinHeight: 660, density: 'airy', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'property-editorial-2026', vertical: 'real_estate', family: 'architectural_editorial', mood: 'spacious architectural luxury', theme: 'property-editorial', tags: ['property','architecture','luxury','minimal'],
    palette: { background: '#F3F1EC', surface: '#FBFAF7', text: '#191A18', muted: '#72736D', accent: '#252B25', accentText: '#FFFFFF', line: '#DAD9D2' },
    display: 'editorial', heroLayout: 'editorial', navStyle: 'transparent', mobileCta: 'inline', radius: 14, maxWidth: 1320, heroMinHeight: 800, density: 'airy', sectionOrder: ['hero','proof','gallery','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'auto-performance-2026', vertical: 'automotive', family: 'performance_editorial', mood: 'technical bold premium', theme: 'auto-performance', tags: ['auto','dark','bold','performance'],
    palette: { background: '#101112', surface: '#181A1C', text: '#F3F4F4', muted: '#A1A7AA', accent: '#D6F365', accentText: '#12160A', line: '#2B2E31' },
    display: 'sans', heroLayout: 'cinematic', navStyle: 'transparent', mobileCta: 'sticky', radius: 18, maxWidth: 1280, heroMinHeight: 760, density: 'balanced', sectionOrder: ['hero','proof','services','gallery','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'fitness-energy-2026', vertical: 'fitness', family: 'performance_modern', mood: 'energetic focused modern', theme: 'fitness-energy', tags: ['fitness','bold','performance','modern'],
    palette: { background: '#111412', surface: '#1B201D', text: '#F5F7F5', muted: '#A5AEA7', accent: '#B8F06A', accentText: '#12170D', line: '#2D342F' },
    display: 'sans', heroLayout: 'split', navStyle: 'floating', mobileCta: 'sticky', radius: 22, maxWidth: 1240, heroMinHeight: 720, density: 'balanced', sectionOrder: ['hero','proof','services','gallery','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'professional-trust-2026', vertical: 'professional', family: 'professional_minimal', mood: 'credible restrained premium', theme: 'professional-trust', tags: ['professional','trust','minimal','corporate'],
    palette: { background: '#F4F5F3', surface: '#FFFFFF', text: '#161A1C', muted: '#687076', accent: '#233E55', accentText: '#FFFFFF', line: '#DCE1E4' },
    display: 'sans', heroLayout: 'editorial', navStyle: 'minimal', mobileCta: 'inline', radius: 18, maxWidth: 1240, heroMinHeight: 680, density: 'airy', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'corporate-system-2026', vertical: 'corporate', family: 'corporate_system', mood: 'sharp structured modern', theme: 'corporate-system', tags: ['corporate','b2b','minimal','structured'],
    palette: { background: '#F2F5F7', surface: '#FFFFFF', text: '#15191D', muted: '#69737D', accent: '#174B70', accentText: '#FFFFFF', line: '#D9E1E7' },
    display: 'sans', heroLayout: 'split', navStyle: 'floating', mobileCta: 'inline', radius: 18, maxWidth: 1240, heroMinHeight: 680, density: 'balanced', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
  {
    id: 'local-service-conversion-2026', vertical: 'general', family: 'local_service_conversion', mood: 'clear contemporary confident', theme: 'local-service-conversion', tags: ['service','local','conversion','clean'],
    palette: { background: '#F4F5F2', surface: '#FFFFFF', text: '#171C19', muted: '#68716C', accent: '#254D41', accentText: '#FFFFFF', line: '#DCE2DE' },
    display: 'sans', heroLayout: 'split', navStyle: 'floating', mobileCta: 'sticky', radius: 24, maxWidth: 1220, heroMinHeight: 680, density: 'airy', sectionOrder: ['hero','proof','services','booking','location'], customerFacing: true, referenceYear: 2026,
  },
];

export const LEGACY_TEST_TEMPLATE_IDS = new Set(['general-modern-v1']);

function normalizedWords(value?: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function getPreviewTemplate(vertical: PreviewVertical, options?: { brandHint?: string }) {
  const candidates = PREVIEW_TEMPLATE_LIBRARY.filter((template) => template.vertical === vertical && template.customerFacing);
  if (!candidates.length) {
    return PREVIEW_TEMPLATE_LIBRARY.find((template) => template.vertical === 'general')!;
  }

  const hintWords = new Set(normalizedWords(options?.brandHint));
  if (!hintWords.size || candidates.length === 1) return candidates[0];

  return [...candidates].sort((a, b) => {
    const score = (template: PreviewTemplate) => template.tags.reduce((total, tag) => total + (hintWords.has(tag) ? 1 : 0), 0);
    return score(b) - score(a) || a.id.localeCompare(b.id);
  })[0];
}

export function getTemplateDesign(template: PreviewTemplate) {
  return {
    family: template.family,
    mood: template.mood,
    theme: template.theme,
    palette: template.palette,
    typography: { ...typography, display: template.display },
    heroLayout: template.heroLayout,
    navStyle: template.navStyle,
    mobileCta: template.mobileCta,
    radius: template.radius,
    maxWidth: template.maxWidth,
    heroMinHeight: template.heroMinHeight,
    density: template.density,
    customerFacing: template.customerFacing,
    referenceYear: template.referenceYear,
  };
}
