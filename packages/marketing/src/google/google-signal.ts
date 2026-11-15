import type { GoogleContext } from './google-context';

const isUserList = (value: string | null): value is string =>
  Boolean(value && /^customers\/\d+\/userLists\/\d+$/.test(value));

/**
 * Offers our customer lists to Performance Max as a hint. Never fatal: when Google refuses,
 * it says so in a note and the ad runs without the hint.
 */
export async function addAudienceSignal(
  ctx: GoogleContext,
  code: string,
  assetGroup: string,
  lists: readonly (string | null)[],
): Promise<string | null> {
  const userLists = lists.filter(isUserList);
  if (userLists.length === 0) return null;
  try {
    const made = await ctx.client.mutate(ctx.access.customerId, 'audiences:mutate', {
      operations: [
        {
          create: {
            name: `${code} · hint`,
            description: 'OneOhm customer lists',
            dimensions: [
              {
                audienceSegments: {
                  segments: userLists.map((userList) => ({ userList: { userList } })),
                },
              },
            ],
          },
        },
      ],
    });
    const audience = made.results?.[0]?.resourceName;
    if (!audience) throw new Error('no audience made');
    await ctx.client.mutate(ctx.access.customerId, 'assetGroupSignals:mutate', {
      operations: [{ create: { assetGroup, audience: { audience } } }],
    });
    return null;
  } catch {
    return 'Google did not take your customer lists as a hint yet; the ad still runs.';
  }
}
