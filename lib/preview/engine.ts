import { getPreviewTemplate } from './templates';
import type { PreviewDocument, PreviewInput, PreviewSection } from './types';

const fallbackServices: Record<PreviewInput['vertical'], string[]> = {
  dental: ['General Dentistry', 'Cosmetic Dentistry', 'Appointments'],
  beauty: ['Signature Treatments', 'Skin & Beauty', 'Appointments'],
  salon: ['Hair', 'Beauty Services', 'Bookings'],
  restaurant: ['Menu Highlights', 'Reservations', 'Location'],
  cafe: ['Coffee & Drinks', 'Food', 'Visit Us'],
  pet_clinic: ['Check-ups', 'Diagnostics', 'Appointments'],
  real_estate: ['Featured Properties', 'Property Services', 'Enquiries'],
  corporate: ['Core Services', 'Solutions', 'Contact'],
  general: ['Services', 'Why Choose Us', 'Contact'],
};

function copyFor(input: PreviewInput) {
  if (input.language === 'ar') {
    return {
      headline: `${input.businessName} بشكل أوضح، أسرع، وأقرب للعميل`,
      subheadline: 'تصور أولي لموقع حديث يوضح الخدمات ويسهّل التواصل والحجز بدون تعقيد.',
      primaryCta: input.vertical === 'restaurant' || input.vertical === 'cafe' ? 'احجز الآن' : 'احجز موعد',
      secondaryCta: 'تواصل عبر واتساب',
      servicesHeading: 'الخدمات',
      proofHeading: 'تجربة أوضح للعميل',
      proofBody: 'تنظيم المحتوى، إبراز الخدمة الأساسية، ووضع الإجراء المطلوب في مكان واضح على الجوال.',
      galleryHeading: 'نظرة على التجربة',
      bookingHeading: 'الحجز والتواصل بسهولة',
      locationHeading: input.city ? `موجودين في ${input.city}` : 'الموقع والتواصل',
      offerHeading: 'مختارات مميزة',
      disclaimer: 'هذا تصور تصميمي أولي وليس الموقع النهائي أو تمثيلاً دقيقاً للهوية الحالية.',
    };
  }

  return {
    headline: `${input.businessName}, presented with more clarity and confidence`,
    subheadline: 'An initial modern website concept designed to make services easier to understand and the next action obvious on mobile.',
    primaryCta: input.vertical === 'restaurant' || input.vertical === 'cafe' ? 'Reserve a table' : 'Book an appointment',
    secondaryCta: 'Chat on WhatsApp',
    servicesHeading: 'Services',
    proofHeading: 'A clearer customer journey',
    proofBody: 'Focused content, strong hierarchy and a clear action path without turning the page into a brochure graveyard.',
    galleryHeading: 'A feel for the experience',
    bookingHeading: 'Booking and contact, without friction',
    locationHeading: input.city ? `Find us in ${input.city}` : 'Location & contact',
    offerHeading: 'Highlights',
    disclaimer: 'This is an initial design concept, not the final website or a claim that it matches the business’s current brand exactly.',
  };
}

export function isPreviewEligible(input: PreviewInput) {
  const reasons: string[] = [];
  if (!input.businessName.trim()) reasons.push('BUSINESS_NAME_REQUIRED');
  if (!(input.explicitRequest || (input.intentScore ?? 0) >= 60)) reasons.push('INTEREST_THRESHOLD_NOT_MET');
  return { eligible: reasons.length === 0, reasons };
}

export function generatePreview(input: PreviewInput): PreviewDocument {
  const template = getPreviewTemplate(input.vertical);
  const copy = copyFor(input);
  const services = (input.services?.filter(Boolean).slice(0, 6) ?? []);
  const visibleServices = services.length ? services : fallbackServices[input.vertical];

  const sectionMap: Record<PreviewSection['kind'], PreviewSection> = {
    hero: { kind: 'hero', heading: copy.headline, body: copy.subheadline },
    services: { kind: 'services', heading: copy.servicesHeading, items: visibleServices },
    proof: { kind: 'proof', heading: copy.proofHeading, body: copy.proofBody },
    gallery: { kind: 'gallery', heading: copy.galleryHeading, items: (input.imageUrls ?? []).slice(0, 6) },
    booking: { kind: 'booking', heading: copy.bookingHeading, body: input.whatsapp || input.phone ? copy.secondaryCta : copy.primaryCta },
    location: { kind: 'location', heading: copy.locationHeading, body: [input.city, input.phone].filter(Boolean).join(' · ') || undefined },
    offer: { kind: 'offer', heading: copy.offerHeading, items: visibleServices.slice(0, 3) },
  };

  return {
    businessName: input.businessName.trim(),
    vertical: input.vertical,
    templateId: template.id,
    language: input.language,
    direction: input.language === 'ar' ? 'rtl' : 'ltr',
    headline: copy.headline,
    subheadline: copy.subheadline,
    primaryCta: copy.primaryCta,
    secondaryCta: input.whatsapp ? copy.secondaryCta : undefined,
    sections: template.sectionOrder.map((kind) => sectionMap[kind]),
    design: {
      family: template.family,
      mood: template.mood,
      radius: template.radius,
      maxWidth: template.maxWidth,
      heroMinHeight: template.heroMinHeight,
      density: template.density,
    },
    assetMode: input.logoUrl || (input.imageUrls?.length ?? 0) > 0 ? 'verified_business_assets' : 'safe_placeholders',
    disclaimer: copy.disclaimer,
  };
}
