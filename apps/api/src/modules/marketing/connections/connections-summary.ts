import type { MarketingConnections } from '@oneohm/api-contracts';
import { marketingJobs, messageTemplates, readBusinessSetting } from '@oneohm/database';
import { MARKETING_MESSAGE_TEMPLATES } from '@oneohm/domain';
import { readConnection, type WhatsAppAccount, whatsAppTemplateStatuses } from '@oneohm/marketing';
import { eq, inArray } from 'drizzle-orm';
import type { Environment } from '../../../config/environment';
import type { FlowDeps } from './connect-flow-types';
import { connectionView, type MetaKnows, templateView } from './connection-words';
import { practiceApprovedKeys, readPracticeTemplates } from './sandbox-templates';

/** The WhatsApp account the server settings name, or null when it is not set up. */
export function whatsappAccount(env: Environment, fetcher: typeof fetch): WhatsAppAccount | null {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_BUSINESS_ACCOUNT_ID) return null;
  return {
    token: env.WHATSAPP_ACCESS_TOKEN,
    wabaId: env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    graphVersion: env.WHATSAPP_API_VERSION,
    appId: env.META_APP_ID ?? null,
    fetch: fetcher,
  };
}

const STATUS_WAIT_MS = 5000;

/** Meta's word on each name, or null when Meta cannot be asked in time. */
async function askMeta(
  account: WhatsAppAccount,
  names: readonly string[],
): Promise<ReadonlyMap<string, MetaKnows> | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), STATUS_WAIT_MS);
    });
    const found = await Promise.race([whatsAppTemplateStatuses(account, names), timeout]);
    if (!found) return null;
    return new Map(found.map((f) => [f.name, { status: f.status, reason: f.reason }]));
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function templatesOf(deps: FlowDeps) {
  const { db, env, config } = deps;
  const keys = MARKETING_MESSAGE_TEMPLATES.map((t) => t.key);
  const rows = await db.select().from(messageTemplates).where(inArray(messageTemplates.key, keys));
  const sandbox = config.mode === 'sandbox';
  const practice = sandbox ? practiceApprovedKeys(await readPracticeTemplates(db)) : null;
  const account = sandbox ? null : whatsappAccount(env, config.fetch);
  const answers = account
    ? await askMeta(
        account,
        rows.map((r) => r.metaName),
      )
    : null;
  return {
    ready: Boolean(whatsappAccount(env, config.fetch)),
    templates: MARKETING_MESSAGE_TEMPLATES.map((def) => {
      const row = rows.find((r) => r.key === def.key);
      const view = {
        key: def.key,
        metaName: row?.metaName ?? def.key,
        preview: row?.preview ?? def.preview,
        active: practice ? practice.has(def.key) : (row?.active ?? false),
      };
      return templateView(
        view,
        {
          asked: Boolean(account),
          failed: Boolean(account) && answers === null,
          known: answers?.get(view.metaName) ?? null,
        },
        sandbox,
      );
    }),
  };
}

/** The place found for reviews: the id is a setting, the name and address come from the lookup. */
async function placeOf(deps: FlowDeps, placeId: string): Promise<MarketingConnections['place']> {
  if (!placeId) return null;
  const [job] = await deps.db.select().from(marketingJobs).where(eq(marketingJobs.key, 'reviews'));
  const data = (job?.data ?? {}) as { placeName?: string; placeAddress?: string };
  return { id: placeId, name: data.placeName ?? '', address: data.placeAddress ?? '' };
}

/** Everything the Connections screen shows. */
export async function buildConnections(deps: FlowDeps): Promise<MarketingConnections> {
  const { db, config } = deps;
  const live = config.mode === 'live';
  const [metaRow, googleRow, settings, whatsapp] = await Promise.all([
    readConnection(db, 'meta', config.mode),
    readConnection(db, 'google', config.mode),
    readBusinessSetting(db, 'marketing'),
    templatesOf(deps),
  ]);
  return {
    mode: config.mode,
    meta: connectionView('meta', metaRow, live ? config.missing.meta : []),
    google: connectionView('google', googleRow, live ? config.missing.google : []),
    whatsapp,
    settings: { ...settings },
    place: await placeOf(deps, settings.googlePlaceId),
  };
}
