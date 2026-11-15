import { describe, expect, it } from 'vitest';
import { approvedMessage } from './message-templates';
import { templateRequestBody } from './whatsapp-cloud';

const names = { metaName: 'offer_revisit', language: 'en' };
const fields = ['customer', 'company', 'message'];
const payload = {
  customer: 'Asha',
  company: 'OneOhm',
  message: 'New subsidy.',
  imageUrl: 'https://api.test/v1/m/abc',
};

describe('image header', () => {
  it('is sent as the first component', () => {
    const body = templateRequestBody({
      toE164: '+919800000000',
      template: 'offer_revisit',
      language: 'en',
      parameters: ['A', 'B', 'C'],
      header: { kind: 'image', link: 'https://api.test/v1/m/abc' },
    });
    expect(body.template.components[0]).toEqual({
      type: 'header',
      parameters: [{ type: 'image', image: { link: 'https://api.test/v1/m/abc' } }],
    });
    expect(body.template.components[1]?.type).toBe('body');
  });

  it('is built only when the photo version is approved and the link is in the payload', () => {
    const on = approvedMessage('offer_revisit', fields, names, payload, true);
    expect(on.header).toEqual({ kind: 'image', link: 'https://api.test/v1/m/abc' });
    expect(on.parameters).toEqual(['Asha', 'OneOhm', 'New subsidy.']);
    expect(approvedMessage('offer_revisit', fields, names, payload, false).header).toBeUndefined();
    const { imageUrl: _gone, ...noPhoto } = payload;
    expect(approvedMessage('offer_revisit', fields, names, noPhoto, true).header).toBeUndefined();
  });
});
