import { describe, expect, it } from 'vitest';
import { fakeGraph, status } from './meta-test-kit';
import { submitWhatsAppTemplate, whatsAppTemplateStatuses } from './whatsapp-templates';

const template = {
  name: 'solar_offer',
  language: 'en',
  category: 'MARKETING' as const,
  body: 'Hi {{1}}, your solar quote is ready',
  examples: ['Asha'],
  headerImage: { bytes: Buffer.from('imagebytes'), contentType: 'image/jpeg' },
};

const account = (fetch: typeof globalThis.fetch) => ({
  token: 'WA',
  wabaId: 'WABA',
  graphVersion: 'v26.0',
  appId: 'APP',
  fetch,
});

describe('whatsapp templates', () => {
  it('uploads the example photo, then submits', async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const { fetch, calls } = fakeGraph({
      'POST APP/uploads': { id: 'upload:1' },
      'POST upload:1': { h: 'HANDLE' },
      'POST WABA/message_templates': { id: 'T1', status: 'PENDING' },
    });
    const spy = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return fetch(input, init);
    }) as typeof fetch;
    const out = await submitWhatsAppTemplate(account(spy), template);
    expect(out).toEqual({ status: 'pending', withImage: true });
    expect(calls[0]?.query.get('file_length')).toBe('10');
    expect(calls[0]?.query.get('file_type')).toBe('image/jpeg');
    expect(calls[0]?.query.has('appsecret_proof')).toBe(false);
    const upload = seen[1]?.init;
    expect(upload?.headers).toMatchObject({ Authorization: 'OAuth WA', file_offset: '0' });
    expect(calls[2]?.body).toMatchObject({
      name: 'solar_offer',
      language: 'en',
      category: 'MARKETING',
      components: [
        { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['HANDLE'] } },
        { type: 'BODY', text: template.body, example: { body_text: [['Asha']] } },
      ],
    });
  });

  it('sends only the body without an image', async () => {
    const { fetch, calls } = fakeGraph({ 'POST WABA/message_templates': { status: 'APPROVED' } });
    const out = await submitWhatsAppTemplate(account(fetch), { ...template, headerImage: null });
    expect(out).toEqual({ status: 'approved', withImage: false });
    expect(calls[0]?.body.components).toHaveLength(1);
  });

  it('goes text-only and says so when there is no app id for the photo', async () => {
    const { fetch, calls } = fakeGraph({ 'POST WABA/message_templates': { status: 'PENDING' } });
    const out = await submitWhatsAppTemplate({ ...account(fetch), appId: null }, template);
    expect(out).toEqual({ status: 'pending', withImage: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body.components).toHaveLength(1);
  });

  it('reads the status when the template already exists', async () => {
    const { fetch } = fakeGraph({
      'POST WABA/message_templates': status(400, {
        error: {
          code: 100,
          error_subcode: 2388024,
          message: 'Content in this language already exists',
          error_user_msg: 'Message template already exists',
        },
      }),
      'GET WABA/message_templates': {
        data: [{ name: 'solar_offer', status: 'APPROVED', components: [] }],
      },
    });
    expect(
      await submitWhatsAppTemplate(account(fetch), { ...template, headerImage: null }),
    ).toEqual({ status: 'approved', withImage: false });
  });

  it('reads statuses with paging, image and reason', async () => {
    const { fetch } = fakeGraph({
      'GET WABA/message_templates': {
        data: [
          {
            name: 'a',
            status: 'REJECTED',
            rejected_reason: 'INVALID_FORMAT',
            components: [{ type: 'BODY' }],
          },
          { name: 'zz', status: 'APPROVED' },
        ],
        paging: { next: 'https://graph.facebook.com/v26.0/WABA/message_templates?after=2' },
      },
    });
    let first = true;
    const wrapped = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('after=2')) {
        return new Response(
          JSON.stringify({
            data: [
              { name: 'b', status: 'APPROVED', components: [{ type: 'HEADER', format: 'IMAGE' }] },
            ],
          }),
        );
      }
      first = false;
      return fetch(input, init);
    }) as typeof fetch;
    const out = await whatsAppTemplateStatuses(account(wrapped), ['a', 'b']);
    expect(first).toBe(false);
    expect(out).toEqual([
      { name: 'a', status: 'rejected', hasImage: false, reason: 'INVALID_FORMAT' },
      { name: 'b', status: 'approved', hasImage: true, reason: null },
    ]);
  });
});
