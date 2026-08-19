import type { PreviewVertical } from './types';

export type PreviewTemplate = {
  id: string;
  vertical: PreviewVertical;
  family: string;
  mood: string;
  radius: number;
  maxWidth: number;
  heroMinHeight: number;
  density: 'airy' | 'balanced';
  sectionOrder: Array<'hero' | 'services' | 'proof' | 'gallery' | 'booking' | 'location' | 'offer'>;
};

export const PREVIEW_TEMPLATES: Record<PreviewVertical, PreviewTemplate> = {
  dental: { id: 'dental-premium-v1', vertical: 'dental', family: 'clinical_editorial', mood: 'bright calm premium', radius: 24, maxWidth: 1180, heroMinHeight: 620, density: 'airy', sectionOrder: ['hero','services','proof','booking','location'] },
  beauty: { id: 'beauty-luxury-v1', vertical: 'beauty', family: 'soft_luxury', mood: 'refined warm minimal', radius: 28, maxWidth: 1160, heroMinHeight: 660, density: 'airy', sectionOrder: ['hero','services','gallery','booking','location'] },
  salon: { id: 'salon-editorial-v1', vertical: 'salon', family: 'fashion_editorial', mood: 'modern elegant editorial', radius: 20, maxWidth: 1180, heroMinHeight: 680, density: 'airy', sectionOrder: ['hero','services','gallery','booking','location'] },
  restaurant: { id: 'restaurant-cinematic-v1', vertical: 'restaurant', family: 'cinematic_editorial', mood: 'dark rich modern', radius: 20, maxWidth: 1220, heroMinHeight: 700, density: 'balanced', sectionOrder: ['hero','offer','services','gallery','booking','location'] },
  cafe: { id: 'cafe-premium-v1', vertical: 'cafe', family: 'warm_editorial', mood: 'warm crafted contemporary', radius: 24, maxWidth: 1180, heroMinHeight: 660, density: 'airy', sectionOrder: ['hero','offer','services','gallery','location'] },
  pet_clinic: { id: 'pet-friendly-premium-v1', vertical: 'pet_clinic', family: 'friendly_clinical', mood: 'bright trusted friendly', radius: 28, maxWidth: 1160, heroMinHeight: 620, density: 'airy', sectionOrder: ['hero','services','proof','booking','location'] },
  real_estate: { id: 'real-estate-luxury-v1', vertical: 'real_estate', family: 'architectural_luxury', mood: 'high contrast spacious premium', radius: 16, maxWidth: 1240, heroMinHeight: 720, density: 'airy', sectionOrder: ['hero','gallery','services','proof','location'] },
  corporate: { id: 'corporate-clean-v1', vertical: 'corporate', family: 'clean_corporate', mood: 'sharp credible modern', radius: 18, maxWidth: 1180, heroMinHeight: 600, density: 'balanced', sectionOrder: ['hero','services','proof','booking'] },
  general: { id: 'general-modern-v1', vertical: 'general', family: 'modern_service', mood: 'clean confident modern', radius: 22, maxWidth: 1160, heroMinHeight: 620, density: 'airy', sectionOrder: ['hero','services','proof','booking','location'] },
};

export function getPreviewTemplate(vertical: PreviewVertical) {
  return PREVIEW_TEMPLATES[vertical] ?? PREVIEW_TEMPLATES.general;
}
