import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PlatformError } from '../errors';
import { createGooglePlatform } from './google-platform';
import {
  type Call,
  fail,
  fakeGoogle,
  launchInput,
  type Route,
  testAccess,
  testApp,
} from './google-test-kit';

// biome-ignore lint/suspicious/noExplicitAny: operations are inspected freely.
type Operation = Record<string, Record<string, any>>;

const hash = (text: string) =>
  createHash('sha256').update(Buffer.from(text)).digest('hex').slice(0, 12);

/** Answers a mutate with a made name per operation (`customers/1/<kind>/<n>`). */
function mutated(call: Call): unknown {
  const ops = (call.body.mutateOperations ?? []) as Record<string, { create?: unknown }>[];
  const status = call.body.mutateOperations?.[0]?.campaignOperation?.update?.status;
  if (status) return { mutateOperationResponses: [{ campaignResult: { resourceName: 'x' } }] };
  return {
    mutateOperationResponses: ops.map((op, index) => {
      const key = Object.keys(op)[0] as string;
      return { [key.replace('Operation', 'Result')]: { resourceName: `made/${key}/${index}` } };
    }),
  };
}

const baseRoutes = (): Route[] => [
  ['googleAds:search', () => ({})],
  ['googleAds:mutate', mutated],
];

const launchCalls = (calls: Call[]) => calls.filter((c) => c.url.endsWith('googleAds:mutate'));

describe('google launch request', () => {
  it('builds the whole paused campaign in one request, then enables the campaign alone', async () => {
    const google = fakeGoogle(baseRoutes());
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const saved: Record<string, string>[] = [];
    const result = await platform.launch(launchInput(), async (ids) => {
      saved.push({ ...ids });
    });
    const [build, enable] = launchCalls(google.calls);
    const ops = build?.body.mutateOperations as Operation[];
    const kinds = ops.map((op) => Object.keys(op)[0]);
    expect(kinds.filter((k) => k === 'campaignOperation')).toHaveLength(1);

    const campaign = ops.find((op) => op.campaignOperation)?.campaignOperation?.create;
    expect(campaign).toMatchObject({
      name: 'SOLAR-01 · Solar in Pune',
      status: 'PAUSED',
      advertisingChannelType: 'PERFORMANCE_MAX',
      maximizeConversions: {},
      geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE' },
      assetAutomationSettings: [
        {
          assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION',
          assetAutomationStatus: 'OPTED_OUT',
        },
      ],
    });
    const budget = ops.find((op) => op.campaignBudgetOperation)?.campaignBudgetOperation?.create;
    expect(budget.amountMicros).toBe('500000000');

    const criteria = ops.filter((op) => op.campaignCriterionOperation);
    expect(criteria).toHaveLength(3);
    expect(criteria[0]?.campaignCriterionOperation?.create.proximity.radius).toBe(25);

    // Brand assets sit on the campaign, not in the asset group.
    const onCampaign = ops
      .filter((op) => op.campaignAssetOperation)
      .map((op) => op.campaignAssetOperation?.create.fieldType);
    expect(onCampaign).toEqual(['BUSINESS_NAME', 'LOGO']);
    const inGroup = ops
      .filter((op) => op.assetGroupAssetOperation)
      .map((op) => op.assetGroupAssetOperation?.create.fieldType);
    expect(inGroup).not.toContain('BUSINESS_NAME');
    expect(inGroup).not.toContain('LOGO');
    expect(inGroup.filter((f) => f === 'HEADLINE').length).toBeGreaterThanOrEqual(3);
    expect(inGroup).toEqual(
      expect.arrayContaining([
        'LONG_HEADLINE',
        'DESCRIPTION',
        'MARKETING_IMAGE',
        'SQUARE_MARKETING_IMAGE',
      ]),
    );

    // Image assets are named after their bytes.
    const images = ops
      .filter((op) => op.assetOperation?.create.imageAsset)
      .map((op) => op.assetOperation?.create.name);
    expect(images).toEqual([
      `OneOhm image ${hash('landscape-bytes')}`,
      `OneOhm image ${hash('square-bytes')}`,
    ]);

    const group = ops.find((op) => op.assetGroupOperation)?.assetGroupOperation?.create;
    expect(group.finalUrls).toEqual(['https://example.test/v1/go/SOLAR-01']);

    // Every id is saved before the campaign is switched on; the switch touches the campaign only.
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      campaign: expect.any(String),
      assetGroup: expect.any(String),
    });
    expect(enable?.body.mutateOperations).toEqual([
      {
        campaignOperation: {
          update: { resourceName: saved[0]?.campaign, status: 'ENABLED' },
          updateMask: 'status',
        },
      },
    ]);
    expect(result.state).toBe('in_review');
  });

  it('refuses an account that is not in rupees before any call', async () => {
    const google = fakeGoogle([]);
    const access = { ...testAccess(), currency: 'USD' };
    const platform = createGooglePlatform(access, testApp(google.fetch));
    const error = await platform.launch(launchInput(), async () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.kind).toBe('account');
    expect(error.message).toBe(
      'This Google Ads account is not in rupees (INR). Pick an account set to INR.',
    );
    expect(google.calls).toHaveLength(0);
    expect(await platform.spend({ since: '2026-11-01', until: '2026-11-02' })).toEqual([]);
    expect((await platform.balance())?.problem).toBe(error.message);
    expect(google.calls).toHaveLength(0);
  });

  it('pauses a campaign that came on when enabling failed, and rethrows', async () => {
    let mutates = 0;
    const google = fakeGoogle([
      [
        'googleAds:search',
        (call) =>
          String(call.body.query).includes('campaign.status')
            ? { results: [{ campaign: { status: 'ENABLED' } }] }
            : {},
      ],
      [
        'googleAds:mutate',
        (call) => {
          mutates += 1;
          if (mutates === 2) return fail(400, { error: { message: 'Could not enable.' } });
          return mutated(call);
        },
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const saved: unknown[] = [];
    const error = await platform
      .launch(launchInput(), async (ids) => void saved.push(ids))
      .catch((e) => e);
    expect(error.message).toBe('Could not enable.');
    expect(saved).toHaveLength(1);
    const last = launchCalls(google.calls).at(-1);
    expect(last?.body.mutateOperations[0].campaignOperation.update.status).toBe('PAUSED');
  });

  it('names the place Google picked when the city had no point', async () => {
    const google = fakeGoogle([
      ...baseRoutes(),
      [
        'geoTargetConstants:suggest',
        () => ({
          geoTargetConstantSuggestions: [
            {
              geoTargetConstant: {
                resourceName: 'geoTargetConstants/1007788',
                targetType: 'City',
                canonicalName: 'Pune,Maharashtra,India',
              },
            },
          ],
        }),
      ],
    ]);
    const platform = createGooglePlatform(testAccess(), testApp(google.fetch));
    const input = launchInput({
      city: { name: 'Pune', latitude: null, longitude: null, radiusKm: 25 },
    });
    const result = await platform.launch(input, async () => {});
    expect(result.notes.join(' ')).toContain('Google shows it in Pune,Maharashtra,India');
    const build = launchCalls(google.calls)[0];
    const criterion = build?.body.mutateOperations.find(
      (op: Record<string, unknown>) => op.campaignCriterionOperation,
    );
    expect(criterion.campaignCriterionOperation.create.location.geoTargetConstant).toBe(
      'geoTargetConstants/1007788',
    );
  });
});
