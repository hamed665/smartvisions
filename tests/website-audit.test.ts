import { describe, expect, it } from 'vitest';
import { analyzeWebsiteHtml, isPrivateIp, normalizeAuditUrl } from '../lib/hunters/business/website-audit';

describe('website audit helpers', () => {
  it('blocks non-http and local URLs', () => {
    expect(() => normalizeAuditUrl('file:///etc/passwd')).toThrow(/HTTP/);
    expect(() => normalizeAuditUrl('http://localhost:3000')).toThrow(/private/);
  });

  it('removes tracking parameters but preserves functional query parameters', () => {
    const url = normalizeAuditUrl('http://www.example.com/path?utm_source=google&utm_campaign=test&lang=en#section');
    expect(url.toString()).toBe('http://www.example.com/path?lang=en');
  });

  it('detects private IP ranges', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.2')).toBe(true);
    expect(isPrivateIp('172.20.1.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
  });

  it('extracts deterministic website signals without an LLM', () => {
    const html = `<!doctype html><html><head><title>Dental Center Muscat</title><meta name="viewport" content="width=device-width"><meta name="description" content="Dental care"></head><body><h1>Dental Clinic</h1><p>Book an appointment. احجز موعد</p><a href="https://wa.me/96890000000">WhatsApp</a><a href="https://instagram.com/example">Instagram</a><p>hello@example.com +968 9000 0000 whitening implant</p></body></html>`;
    const result = analyzeWebsiteHtml(html);
    expect(result.title).toBe('Dental Center Muscat');
    expect(result.hasArabic).toBe(true);
    expect(result.hasEnglish).toBe(true);
    expect(result.hasBooking).toBe(true);
    expect(result.hasWhatsapp).toBe(true);
    expect(result.mobileQuality).toBe('GOOD');
    expect(result.seoQuality).toBe('GOOD');
    expect(result.ctaQuality).toBe('GOOD');
    expect(result.contactEmails).toContain('hello@example.com');
    expect(result.socialLinks.instagram).toContain('instagram.com/example');
  });
});
