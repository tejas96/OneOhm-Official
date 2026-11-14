import { DEFAULT_MESSAGE_TEMPLATES } from '@oneohm/domain';
import { describe, expect, it } from 'vitest';
import { templateLogText } from './chat-history';

const words = DEFAULT_MESSAGE_TEMPLATES.find((item) => item.key === 'payment_received');
if (!words) throw new Error('payment_received is a default template');
const values = {
  customer: 'Asha',
  project: 'OH-1',
  amount: '₹40,000',
  milestone: 'Advance on order confirmation',
};
const names = { metaName: 'payment_received', language: 'en' };

describe('what the staff log says a template said', () => {
  it('is the English preview for an English template', () => {
    const text = templateLogText(
      'payment_received',
      words,
      { ...values, language: 'en-IN' },
      { ...names, metaNameMr: 'payment_received_mr' },
    );
    expect(text).toContain('₹40,000');
    expect(text).not.toContain('मिळाले');
  });

  it('is the Marathi text, tagged, when the Marathi template went out', () => {
    const text = templateLogText(
      'payment_received',
      words,
      { ...values, language: 'mr-IN' },
      { ...names, metaNameMr: 'payment_received_mr' },
    );
    expect(text).toBe(
      'पेमेंट मिळाले: ₹40,000 मिळाले — ऑर्डर पक्की झाल्यावर ॲडव्हान्स. धन्यवाद! · sent in Marathi',
    );
  });

  it('stays the English preview for a Marathi customer whose template is English', () => {
    const text = templateLogText(
      'payment_received',
      words,
      { ...values, language: 'mr-IN' },
      names,
    );
    expect(text).not.toContain('मिळाले');
  });
});
