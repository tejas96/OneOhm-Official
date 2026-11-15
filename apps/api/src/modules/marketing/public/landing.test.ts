import { describe, expect, it } from 'vitest';
import { esc } from './html';
import { checkForm, leadSourceOf, readForm } from './landing-lead';
import { renderEnded, renderLanding, renderPrivacy, whatsappLink } from './landing-page';
import { byteRange } from './media-range';

const view = {
  brand: 'Sun <Power>',
  code: 'SOLAR-26',
  pageUrl: 'https://app.example.com/api/v1/go/SOLAR-26',
  text: 'Free survey "this week"\n<script>alert(1)</script>',
  media: { kind: 'image' as const, path: '/v1/m/abc' },
  whatsappDigits: '919800000000',
  ref: 'k3x9ab',
  city: 'Pune "East"',
};

describe('landing page', () => {
  it('escapes every value', () => {
    const page = renderLanding({
      ...view,
      error: '<b>bad</b>',
      values: { name: '"><x', phone: '1', city: 'a&b' },
    });
    expect(page).not.toContain('<script>');
    expect(page).not.toContain('<b>bad</b>');
    expect(page).toContain('Sun &lt;Power&gt;');
    expect(page).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(page).toContain('value="&quot;&gt;&lt;x"');
    expect(page).toContain('value="a&amp;b"');
    expect(esc("'")).toBe('&#39;');
  });

  it('builds the WhatsApp link with the code and this visit ref', () => {
    expect(whatsappLink('+91 98000 00000', 'SOLAR-26', 'k3x9ab')).toBe(
      'https://wa.me/919800000000?text=Hi%20OneOhm%20SOLAR-26%20%23k3x9ab',
    );
    expect(whatsappLink('919800000000', 'SOLAR-26', null)).toBe(
      'https://wa.me/919800000000?text=Hi%20OneOhm%20SOLAR-26',
    );
    expect(renderLanding(view)).toContain('Chat on WhatsApp');
  });

  it('prefills the city, carries the ref and has a hidden trap field', () => {
    const page = renderLanding(view);
    expect(page).toContain(
      'name="city" autocomplete="address-level2" required maxlength="80" value="Pune &quot;East&quot;"',
    );
    expect(page).toContain('name="ref" value="k3x9ab"');
    expect(page).toContain('name="website"');
    // Absolute, so it works behind the proxy that serves the API under /api.
    expect(page).toContain('action="https://app.example.com/api/v1/go/SOLAR-26"');
    expect(page).toContain('href="https://app.example.com/api/v1/go/SOLAR-26/privacy"');
  });

  it('has no chat button without a business number, and shows a video as a video', () => {
    const page = renderLanding({
      ...view,
      whatsappDigits: null,
      media: { kind: 'video', path: '/v1/m/v' },
    });
    expect(page).not.toContain('Chat on WhatsApp');
    expect(page).toContain('<video controls');
  });

  it('says the offer has ended with the phone', () => {
    const page = renderEnded('Sun Power', '+91 98000 00000');
    expect(page).toContain('This offer has ended');
    expect(page).toContain('tel:+919800000000');
  });

  it('names who collects the details on the privacy page', () => {
    const page = renderPrivacy({
      legalName: 'Sun Power Pvt Ltd',
      address: '1 Main Rd, Pune',
      email: 'hi@sun.in',
    });
    expect(page).toContain('Sun Power Pvt Ltd');
    expect(page).toContain('hi@sun.in');
  });
});

describe('call-back form', () => {
  it('checks name, Indian mobile and city', () => {
    expect(checkForm(readForm({ name: 'A', phone: '9800000000', city: 'Pune' }))).toEqual({
      error: 'Please enter your name.',
    });
    expect(checkForm(readForm({ name: 'Asha', phone: '12345', city: 'Pune' }))).toEqual({
      error: 'Enter a 10-digit Indian mobile number.',
    });
    expect(checkForm(readForm({ name: 'Asha', phone: '98000 00000', city: 'Pune' }))).toEqual({
      name: 'Asha',
      phone: '+919800000000',
      city: 'Pune',
    });
  });

  it('picks the lead source from the click', () => {
    expect(leadSourceOf({ gclid: 'g', fbclid: null, utmSource: null })).toBe('google');
    expect(leadSourceOf({ gclid: null, fbclid: 'f', utmSource: 'Instagram' })).toBe('instagram');
    expect(leadSourceOf({ gclid: null, fbclid: 'f', utmSource: 'facebook' })).toBe('facebook');
    expect(leadSourceOf({ gclid: null, fbclid: 'f', utmSource: null })).toBe('facebook');
    expect(leadSourceOf({ gclid: null, fbclid: null, utmSource: 'google' })).toBe('website');
  });
});

describe('media range', () => {
  it('passes one plain range and ignores the rest', () => {
    expect(byteRange('bytes=0-1023')).toBe('bytes=0-1023');
    expect(byteRange('bytes=0-1,5-9')).toBeUndefined();
    expect(byteRange(undefined)).toBeUndefined();
  });
});
