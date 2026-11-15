import type { MetaAccess } from '../access';
import { PlatformError } from '../errors';
import { phoneDigits } from '../hashing';
import type { LaunchInput } from '../types';
import type { Graph } from './meta-graph';
import { buildTargeting, geoLocations } from './meta-targeting';

type Json = Record<string, unknown>;

export const STATUS_NOT_OPEN =
  'WhatsApp Status is not open for this ad account yet. Your ad runs on the other places.';

function goalFields(access: MetaAccess, input: LaunchInput): Json {
  const pageId = access.details.pageId;
  if (input.goal === 'chats') {
    return {
      optimization_goal: 'CONVERSATIONS',
      destination_type: 'WHATSAPP',
      promoted_object: {
        page_id: pageId,
        whatsapp_phone_number: phoneDigits(input.whatsappNumber ?? ''),
      },
    };
  }
  return {
    optimization_goal: 'LEAD_GENERATION',
    destination_type: 'ON_AD',
    promoted_object: { page_id: pageId },
  };
}

const PLACEMENT_WORDS = /whatsapp|placement|\bstatus\b/i;

/** True only when Meta's refusal is about the WhatsApp Status placement (not a permission or other fault). */
function isPlacementRefusal(error: unknown): boolean {
  if (!(error instanceof PlatformError)) return false;
  if (error.kind !== 'invalid' && error.kind !== 'not_available') return false;
  return PLACEMENT_WORDS.test(`${error.detail ?? ''} ${error.message}`);
}

/** Makes the paused ad set; tries WhatsApp Status first and falls back once without it. */
export async function createAdSet(
  graph: Graph,
  access: MetaAccess,
  input: LaunchInput,
  campaignId: string,
  statusPlacement: string | undefined,
): Promise<{ id: string; statusPlacement: 'available' | 'not_available'; notes: string[] }> {
  const geo = await geoLocations(graph, input.city);
  const wantStatus = statusPlacement !== 'not_available';
  const make = (withWhatsApp: boolean) =>
    graph.post<{ id: string }>(`${access.adAccountId}/adsets`, {
      name: `${input.code} · Ad set`,
      campaign_id: campaignId,
      daily_budget: input.dailyBudgetPaise,
      billing_event: 'IMPRESSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      ...goalFields(access, input),
      targeting: buildTargeting(input, withWhatsApp, geo),
      status: 'PAUSED',
    });
  if (!wantStatus)
    return { id: (await make(false)).id, statusPlacement: 'not_available', notes: [] };
  try {
    return { id: (await make(true)).id, statusPlacement: 'available', notes: [] };
  } catch (error) {
    if (!isPlacementRefusal(error)) throw error;
    const retry = await make(false);
    return { id: retry.id, statusPlacement: 'not_available', notes: [STATUS_NOT_OPEN] };
  }
}
