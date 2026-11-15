import { describe, expect, it } from 'vitest';
import { createMetaPlatform } from './meta-platform';
import { baseRoutes, fakeGraph, launchInput, metaAccess, metaApp, status } from './meta-test-kit';

const instant = async () => {};

describe('meta launch', () => {
  it('makes everything paused, saves after each step and switches on last', async () => {
    const { fetch, calls } = fakeGraph(baseRoutes());
    const saved: Record<string, string>[] = [];
    const platform = createMetaPlatform(metaAccess(), metaApp(fetch), { sleep: instant });
    const result = await platform.launch(launchInput(), async (ids) => {
      saved.push({ ...ids });
    });

    const posts = calls.filter((c) => c.method === 'POST').map((c) => c.path);
    expect(posts).toEqual([
      'act_123/adimages',
      'act_123/campaigns',
      'act_123/adsets',
      'act_123/adcreatives',
      'act_123/ads',
      'A1',
      'S1',
      'C1',
    ]);
    expect(calls.find((c) => c.path === 'act_123/adimages')?.body.bytes).toBe(
      Buffer.from('img').toString('base64'),
    );
    const campaign = calls.find((c) => c.path === 'act_123/campaigns' && c.method === 'POST');
    expect(campaign?.body).toMatchObject({
      name: 'SOLAR-01 · Rooftop solar',
      objective: 'OUTCOME_ENGAGEMENT',
      special_ad_categories: [],
      status: 'PAUSED',
    });
    for (const id of ['A1', 'S1', 'C1']) {
      expect(calls.find((c) => c.path === id)?.body).toEqual({ status: 'ACTIVE' });
    }
    expect(calls.find((c) => c.path === 'act_123/ads')?.body.status).toBe('PAUSED');
    expect(saved.map((s) => Object.keys(s).length)).toEqual([1, 2, 4, 5, 6]);
    expect(result).toMatchObject({
      externalId: 'C1',
      state: 'in_review',
      ads: [{ externalId: 'A1', name: 'SOLAR-01 · Ad' }],
    });
    expect(result.externalIds).toMatchObject({
      adSet: 'S1',
      ad: 'A1',
      statusPlacement: 'available',
    });
    expect(calls[0]?.query.get('appsecret_proof')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds the chat ad set, targeting and creative', async () => {
    const { fetch, calls } = fakeGraph(baseRoutes());
    const platform = createMetaPlatform(metaAccess(), metaApp(fetch), { sleep: instant });
    await platform.launch(
      launchInput({
        channels: ['facebook', 'instagram'],
        audiences: { interested: 'AI', lookalike: 'AL', customers: 'AC' },
      }),
      async () => {},
    );
    const adset = calls.find((c) => c.path === 'act_123/adsets')?.body;
    expect(adset).toMatchObject({
      daily_budget: 50000,
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      optimization_goal: 'CONVERSATIONS',
      destination_type: 'WHATSAPP',
      promoted_object: { page_id: 'page1', whatsapp_phone_number: '919876543210' },
      status: 'PAUSED',
    });
    expect(adset?.targeting).toMatchObject({
      geo_locations: {
        custom_locations: [
          { latitude: 18.5, longitude: 73.8, radius: 25, distance_unit: 'kilometer' },
        ],
      },
      targeting_automation: { advantage_audience: 1 },
      publisher_platforms: ['facebook', 'instagram', 'whatsapp'],
      instagram_positions: ['stream', 'story', 'reels', 'explore', 'explore_home', 'profile_feed'],
      whatsapp_positions: ['status'],
      custom_audiences: [{ id: 'AI' }, { id: 'AL' }],
      excluded_custom_audiences: [{ id: 'AC' }],
    });
    const spec = calls.find((c) => c.path === 'act_123/adcreatives')?.body
      .object_story_spec as Record<string, Record<string, unknown>>;
    expect(spec).toMatchObject({ page_id: 'page1', instagram_user_id: 'ig1' });
    expect(spec.link_data).toMatchObject({
      image_hash: 'H1',
      name: 'Cut your bill',
      call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
    });
    expect(String(spec.link_data?.link)).toContain(
      'https://api.whatsapp.com/send?phone=919876543210',
    );
  });

  it('adds only the Instagram story when the business did not pick Instagram', async () => {
    const { fetch, calls } = fakeGraph(baseRoutes());
    await createMetaPlatform(metaAccess(), metaApp(fetch)).launch(launchInput(), async () => {});
    const targeting = calls.find((c) => c.path === 'act_123/adsets')?.body.targeting;
    expect(targeting).toMatchObject({ instagram_positions: ['story'] });
  });

  it('retries once without WhatsApp Status and says so', async () => {
    let tries = 0;
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'POST act_123/adsets': () => {
        tries += 1;
        return tries === 1
          ? status(400, {
              error: { code: 100, message: 'bad placement', error_user_msg: 'No status' },
            })
          : { id: 'S1' };
      },
    });
    const result = await createMetaPlatform(metaAccess(), metaApp(fetch)).launch(
      launchInput({ channels: ['facebook'] }),
      async () => {},
    );
    const sets = calls.filter((c) => c.path === 'act_123/adsets');
    expect(sets).toHaveLength(2);
    expect(JSON.stringify(sets[1]?.body.targeting)).not.toContain('whatsapp');
    expect(JSON.stringify(sets[1]?.body.targeting)).not.toContain('instagram');
    expect(result.externalIds.statusPlacement).toBe('not_available');
    expect(result.notes).toContain(
      'WhatsApp Status is not open for this ad account yet. Your ad runs on the other places.',
    );
  });

  it('skips WhatsApp Status when it is known to be closed', async () => {
    const { fetch, calls } = fakeGraph(baseRoutes());
    await createMetaPlatform(
      metaAccess({ statusPlacement: 'not_available' }),
      metaApp(fetch),
    ).launch(launchInput(), async () => {});
    expect(calls.filter((c) => c.path === 'act_123/adsets')).toHaveLength(1);
    expect(JSON.stringify(calls.find((c) => c.path === 'act_123/adsets')?.body)).not.toContain(
      'whatsapp_positions',
    );
  });

  it('resumes from earlier ids and finds a campaign by its code', async () => {
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'GET act_123/campaigns': { data: [{ id: 'C1', name: 'SOLAR-01 · Rooftop solar' }] },
    });
    const result = await createMetaPlatform(metaAccess(), metaApp(fetch)).launch(
      launchInput({ previous: { imageHash: 'H0' } }),
      async () => {},
    );
    const finder = calls.find((c) => c.method === 'GET');
    expect(JSON.parse(finder?.query.get('filtering') ?? '[]')).toEqual([
      { field: 'name', operator: 'CONTAIN', value: 'SOLAR-01' },
    ]);
    expect(calls.some((c) => c.path === 'act_123/adimages')).toBe(false);
    expect(calls.some((c) => c.method === 'POST' && c.path === 'act_123/campaigns')).toBe(false);
    expect(result.externalId).toBe('C1');

    const again = fakeGraph({ ...baseRoutes(), 'POST A1': {}, 'POST S1': {}, 'POST C1': {} });
    await createMetaPlatform(metaAccess(), metaApp(again.fetch)).launch(
      launchInput({
        previous: { campaign: 'C1', adSet: 'S1', creative: 'CR1', ad: 'A1', imageHash: 'H' },
      }),
      async () => {},
    );
    expect(again.calls.map((c) => c.path)).toEqual(['A1', 'S1', 'C1']);
  });

  it('throws plain words when the city is unknown', async () => {
    const { fetch } = fakeGraph({ ...baseRoutes(), 'GET search': { data: [] } });
    const platform = createMetaPlatform(metaAccess(), metaApp(fetch));
    await expect(
      platform.launch(
        launchInput({ city: { name: 'Nowhere', latitude: null, longitude: null, radiusKm: 20 } }),
        async () => {},
      ),
    ).rejects.toMatchObject({
      kind: 'invalid',
      message: 'Meta does not know the city "Nowhere". Pick a nearby bigger city.',
    });
  });

  it('looks the city up when there are no coordinates', async () => {
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'GET search': { data: [{ key: '2418' }] },
    });
    await createMetaPlatform(metaAccess(), metaApp(fetch)).launch(
      launchInput({ city: { name: 'Pune', latitude: null, longitude: null, radiusKm: 20 } }),
      async () => {},
    );
    const search = calls.find((c) => c.path === 'search');
    expect(search?.query.get('type')).toBe('adgeolocation');
    expect(search?.query.get('q')).toBe('Pune');
    expect(calls.find((c) => c.path === 'act_123/adsets')?.body.targeting).toMatchObject({
      geo_locations: { cities: [{ key: '2418' }] },
    });
  });
});
