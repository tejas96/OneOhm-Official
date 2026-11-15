import { describe, expect, it } from 'vitest';
import { PlatformError } from '../errors';
import { createMetaPlatform } from './meta-platform';
import { baseRoutes, fakeGraph, launchInput, metaAccess, metaApp } from './meta-test-kit';

const instant = async () => {};

describe('meta launch: lead form and video', () => {
  it('takes the lead form path', async () => {
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'POST page1/leadgen_forms': { id: 'F1' },
    });
    await createMetaPlatform(metaAccess(), metaApp(fetch)).launch(
      launchInput({ goal: 'lead_form', whatsappNumber: null }),
      async () => {},
    );
    const form = calls.find((c) => c.path === 'page1/leadgen_forms');
    expect(form?.query.get('access_token')).toBe('page-token');
    expect(form?.body).toMatchObject({
      questions: [{ type: 'FULL_NAME' }, { type: 'PHONE' }, { type: 'CITY' }],
      privacy_policy: { url: 'https://oneohm.test/privacy', link_text: 'Privacy policy' },
      locale: 'EN_US',
    });
    expect(
      calls.find((c) => c.path === 'act_123/campaigns' && c.method === 'POST')?.body.objective,
    ).toBe('OUTCOME_LEADS');
    expect(calls.find((c) => c.path === 'act_123/adsets')?.body).toMatchObject({
      optimization_goal: 'LEAD_GENERATION',
      destination_type: 'ON_AD',
      promoted_object: { page_id: 'page1' },
    });
    const spec = calls.find((c) => c.path === 'act_123/adcreatives')?.body.object_story_spec as {
      link_data: { link: string; call_to_action: unknown };
    };
    expect(spec.link_data.link).toBe('https://oneohm.test/solar');
    expect(spec.link_data.call_to_action).toEqual({
      type: 'SIGN_UP',
      value: { lead_gen_form_id: 'F1' },
    });
  });

  it('waits for a video, then uses its thumbnail', async () => {
    let polls = 0;
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'POST act_123/advideos': { id: 'V1' },
      'GET V1': () => ({ status: { video_status: ++polls < 3 ? 'processing' : 'ready' } }),
      'GET V1/thumbnails': {
        data: [{ uri: 'https://t/1' }, { uri: 'https://t/2', is_preferred: true }],
      },
    });
    let slept = 0;
    const input = launchInput();
    await createMetaPlatform(metaAccess(), metaApp(fetch), {
      sleep: async () => {
        slept += 1;
      },
    }).launch(
      { ...input, media: { ...input.media, kind: 'video', publicUrl: 'https://x.test/v.mp4' } },
      async () => {},
    );
    expect(calls.find((c) => c.path === 'act_123/advideos')?.body.file_url).toBe(
      'https://x.test/v.mp4',
    );
    expect(slept).toBe(2);
    const spec = calls.find((c) => c.path === 'act_123/adcreatives')?.body.object_story_spec as {
      video_data: Record<string, unknown>;
    };
    expect(spec.video_data).toMatchObject({
      video_id: 'V1',
      image_url: 'https://t/2',
      title: 'Cut your bill',
    });
  });

  it('gives up on a video that never gets ready', async () => {
    const { fetch } = fakeGraph({
      ...baseRoutes(),
      'POST act_123/advideos': { id: 'V1' },
      'GET V1': { status: { video_status: 'processing' } },
    });
    const input = launchInput();
    const run = createMetaPlatform(metaAccess(), metaApp(fetch), { sleep: instant }).launch(
      { ...input, media: { ...input.media, kind: 'video' } },
      async () => {},
    );
    await expect(run).rejects.toBeInstanceOf(PlatformError);
    await expect(run).rejects.toMatchObject({
      kind: 'temporary',
      message: 'Meta is still getting the video ready. Try again in a minute.',
    });
  });
});
