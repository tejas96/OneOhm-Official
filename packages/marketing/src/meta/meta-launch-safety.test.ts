import { describe, expect, it } from 'vitest';
import { createMetaPlatform } from './meta-platform';
import { baseRoutes, fakeGraph, launchInput, metaAccess, metaApp, status } from './meta-test-kit';

describe('meta launch safety', () => {
  it('refuses a non-rupee ad account before creating anything', async () => {
    const { fetch, calls } = fakeGraph(baseRoutes());
    await expect(
      createMetaPlatform({ ...metaAccess(), currency: 'USD' }, metaApp(fetch)).launch(
        launchInput(),
        async () => {},
      ),
    ).rejects.toMatchObject({
      kind: 'account',
      message: 'This Meta ad account is not in rupees (INR). Pick an ad account set to INR.',
    });
    expect(calls).toHaveLength(0);
  });

  it('pauses the campaign again when switching on fails', async () => {
    const posts: string[] = [];
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'POST S1': () => status(500, { error: { code: 2, message: 'boom' } }),
      'POST C1': (call: { body: Record<string, unknown> }) => {
        posts.push(String(call.body.status));
        return { success: true };
      },
    });
    const saved: Record<string, string>[] = [];
    await expect(
      createMetaPlatform(metaAccess(), metaApp(fetch)).launch(launchInput(), async (ids) => {
        saved.push({ ...ids });
      }),
    ).rejects.toMatchObject({ kind: 'temporary' });
    expect(posts).toEqual(['PAUSED']);
    expect(calls.at(-1)).toMatchObject({ path: 'C1', body: { status: 'PAUSED' } });
    expect(saved.at(-1)).toMatchObject({ campaign: 'C1', adSet: 'S1', creative: 'CR1', ad: 'A1' });
  });

  it('does not treat a permission refusal as "Status not open"', async () => {
    const { fetch, calls } = fakeGraph({
      ...baseRoutes(),
      'POST act_123/adsets': status(403, {
        error: { code: 200, message: 'Requires ads_management' },
      }),
    });
    await expect(
      createMetaPlatform(metaAccess(), metaApp(fetch)).launch(launchInput(), async () => {}),
    ).rejects.toMatchObject({ kind: 'permission' });
    expect(calls.filter((c) => c.path === 'act_123/adsets')).toHaveLength(1);
  });
});
