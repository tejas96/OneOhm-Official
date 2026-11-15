import { PlatformError } from '../errors';
import type { LaunchInput, LaunchResult, PlatformIds } from '../types';
import { type GoogleContext, gaqlText, isRupees, lastId, NOT_RUPEES } from './google-context';
import { buildLaunch } from './google-launch-ops';
import { resolveLocation } from './google-location';
import { addAudienceSignal } from './google-signal';
import { enableCampaign } from './google-state';
import { googleTexts } from './google-texts';

const NEEDS_PHOTO = 'Google needs a photo. Add a photo to run on Google.';

function result(input: LaunchInput, ids: PlatformIds, notes: string[]): LaunchResult {
  const id = lastId(ids.campaign ?? '');
  return {
    externalId: id,
    externalIds: ids,
    ads: [{ externalId: id, name: input.name }],
    state: 'in_review',
    notes,
  };
}

/** An earlier try's campaign, found by its code, with its budget and asset group. */
async function findExisting(ctx: GoogleContext, code: string): Promise<PlatformIds | null> {
  const customer = ctx.access.customerId;
  const [row] = await ctx.client.search(
    customer,
    `SELECT campaign.resource_name, campaign.id, campaign.campaign_budget FROM campaign WHERE campaign.name LIKE '${gaqlText(code)} ·%' AND campaign.status != 'REMOVED'`,
  );
  const campaign = row?.campaign;
  if (!campaign?.resourceName) return null;
  const [group] = await ctx.client.search(
    customer,
    `SELECT asset_group.resource_name FROM asset_group WHERE campaign.id = ${lastId(campaign.resourceName)} AND asset_group.status != 'REMOVED'`,
  );
  return {
    campaign: campaign.resourceName,
    ...(campaign.campaignBudget ? { budget: campaign.campaignBudget } : {}),
    ...(group?.assetGroup?.resourceName ? { assetGroup: group.assetGroup.resourceName } : {}),
  };
}

/** The ids Google made, by where the request put them. Throws when the campaign is missing. */
function idsFrom(
  built: ReturnType<typeof buildLaunch>,
  answer: { mutateOperationResponses?: unknown },
): Record<string, string> {
  const made = (answer.mutateOperationResponses ?? []) as Record<
    string,
    { resourceName?: string }
  >[];
  const nameAt = (index: number | null, key: string): string | undefined =>
    index === null ? undefined : made[index]?.[key]?.resourceName;
  const campaign = nameAt(built.at.campaign, 'campaignResult');
  if (!campaign) throw new PlatformError('invalid', 'Google did not confirm the new campaign.');
  const ids: Record<string, string> = { campaign };
  const wanted: [string, string | undefined][] = [
    ['budget', nameAt(built.at.budget, 'campaignBudgetResult')],
    ['assetGroup', nameAt(built.at.assetGroup, 'assetGroupResult')],
    ['leadForm', nameAt(built.at.leadForm, 'assetResult')],
  ];
  for (const [key, value] of wanted) if (value) ids[key] = value;
  return ids;
}

/** Makes a paused Performance Max campaign in one request, keeps its ids, then switches it on. */
export async function launchGoogle(
  ctx: GoogleContext,
  input: LaunchInput,
  saveIds: (ids: PlatformIds) => Promise<void>,
): Promise<LaunchResult> {
  if (!isRupees(ctx)) throw new PlatformError('account', NOT_RUPEES);
  const crops = input.media.crops;
  if (input.media.kind === 'video' || !crops) throw new PlatformError('invalid', NEEDS_PHOTO);

  if (input.previous.campaign) {
    const ids = input.previous;
    await enableCampaign(ctx, ids.campaign as string);
    return result(input, ids, []);
  }
  const existing = await findExisting(ctx, input.code);
  if (existing) {
    await saveIds(existing);
    await enableCampaign(ctx, existing.campaign as string);
    return result(input, existing, []);
  }

  const leadFormKey = ctx.access.details.leadFormKey ?? null;
  if (input.goal === 'lead_form' && !leadFormKey) {
    throw new PlatformError('invalid', 'Connect Google again to set up lead forms.');
  }
  const location = await resolveLocation(ctx, input.city);
  const [landscape, square, logo] = await Promise.all([
    crops.landscape(),
    crops.square(),
    input.logo ? input.logo() : Promise.resolve(null),
  ]);
  const built = buildLaunch({
    customerId: ctx.access.customerId,
    code: input.code,
    input,
    texts: googleTexts(input),
    pictures: {
      landscape: landscape.toString('base64'),
      square: square.toString('base64'),
      logo: logo ? logo.toString('base64') : null,
    },
    location,
    leadFormKey,
  });
  const answer = await ctx.client.mutate(ctx.access.customerId, 'googleAds:mutate', {
    mutateOperations: built.operations,
  });
  const ids = idsFrom(built, answer);
  const { campaign, assetGroup } = ids;
  await saveIds(ids);

  const notes: string[] = [];
  if (location.kind === 'geo' && location.canonicalName) {
    notes.push(`${input.city.name}: Google shows it in ${location.canonicalName}.`);
  }
  if (assetGroup) {
    const note = await addAudienceSignal(ctx, input.code, assetGroup, [
      input.audiences.interested,
      input.audiences.customers,
    ]);
    if (note) notes.push(note);
  }
  await enableCampaign(ctx, campaign as string);
  return result(input, ids, notes);
}
