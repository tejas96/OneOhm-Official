import type { MetaAccess, MetaAppConfig } from '../access';
import type { AdPlatform } from '../types';
import { ensureMetaLookalike, syncMetaAudience } from './meta-audiences';
import { sendMetaConversions } from './meta-conversions';
import { metaGraph } from './meta-graph';
import { metaAdStatuses, metaBalance, metaSpend, setMetaState } from './meta-insights';
import { launchMeta } from './meta-launch';
import { type MetaOptions, realSleep } from './meta-sleep';

/** Meta ads (Facebook, Instagram, WhatsApp Status) behind the shared `AdPlatform` shape. */
export function createMetaPlatform(
  access: MetaAccess,
  app: MetaAppConfig,
  options: MetaOptions = {},
): AdPlatform {
  const graph = metaGraph(app, access.userToken);
  return {
    provider: 'meta',
    launch: (input, saveIds) => launchMeta(access, app, input, saveIds, options.sleep ?? realSleep),
    setState: (placement, state) => setMetaState(graph, placement, state),
    adStatuses: (adIds) => metaAdStatuses(graph, adIds),
    spend: (range) => metaSpend(graph, access, range),
    balance: () => metaBalance(graph, access),
    sendConversions: (events) => sendMetaConversions(graph, access, events),
    syncAudience: (change) => syncMetaAudience(graph, access, change),
    ensureLookalike: (seedId, existing) => ensureMetaLookalike(graph, access, seedId, existing),
  };
}
