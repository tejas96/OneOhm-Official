import { META_EVENT_NAME, type MetaMatch } from '@oneohm/domain';
import type { MetaAccess } from '../access';
import { PlatformError } from '../errors';
import { hashEmail, hashPhoneFor } from '../hashing';
import type { ConversionInput, ConversionOutcome } from '../types';
import type { Graph } from './meta-graph';

const BATCH = 500;

type Json = Record<string, unknown>;

function matchOf(access: MetaAccess, event: ConversionInput): MetaMatch {
  // A WhatsApp click needs the WhatsApp Business account; without it, send it as a web-style event.
  if (event.ctwaClid && access.details.whatsappBusinessAccountId) return 'ctwa';
  if (event.platformLeadId) return 'lead_form';
  return 'web';
}

/** One event the way the Conversions API takes it. */
export function conversionPayload(access: MetaAccess, event: ConversionInput): Json {
  const match = matchOf(access, event);
  const email = hashEmail(event.email);
  const userData: Json = {
    ph: [hashPhoneFor('meta', event.phoneE164)],
    ...(email ? { em: [email] } : {}),
    ...(match === 'ctwa'
      ? {
          ctwa_clid: event.ctwaClid,
          whatsapp_business_account_id: access.details.whatsappBusinessAccountId,
        }
      : {}),
    ...(match === 'lead_form' ? { lead_id: event.platformLeadId } : {}),
    ...(event.fbclid ? { fbc: `fb.1.${event.leadCreatedAt.getTime()}.${event.fbclid}` } : {}),
  };
  return {
    event_name: META_EVENT_NAME[match][event.event],
    event_time: Math.floor(event.eventAt.getTime() / 1000),
    event_id: event.id,
    action_source: match === 'ctwa' ? 'business_messaging' : 'system_generated',
    ...(match === 'ctwa' ? { messaging_channel: 'whatsapp' } : {}),
    user_data: userData,
    custom_data: {
      currency: 'INR',
      ...(event.valuePaise !== null ? { value: event.valuePaise / 100 } : {}),
      event_source: 'crm',
      lead_event_source: 'OneOhm',
    },
  };
}

/** Meta refuses the whole request when one event is over 7 days old, so stop a little short. */
const MAX_AGE_MS = 6.5 * 24 * 60 * 60 * 1000;

/** Why one event should not go to Meta at all, or null when it can. */
function problemWith(event: ConversionInput, now: number): ConversionOutcome | null {
  if (now - event.eventAt.getTime() > MAX_AGE_MS) {
    return {
      id: event.id,
      status: 'skipped',
      error: 'Meta only takes events from the last 7 days',
    };
  }
  const needsValue = event.event === 'won' || event.event === 'advance_paid';
  if (needsValue && event.valuePaise === null) {
    return { id: event.id, status: 'skipped', error: 'No deal value yet' };
  }
  return null;
}

export async function sendMetaConversions(
  graph: Graph,
  access: MetaAccess,
  events: readonly ConversionInput[],
  now: number = Date.now(),
): Promise<ConversionOutcome[]> {
  const datasetId = access.details.datasetId;
  if (!datasetId) {
    return events.map((e) => ({
      id: e.id,
      status: 'retry',
      error: 'No Conversions API dataset yet',
    }));
  }
  const outcomes = new Map<string, ConversionOutcome>();
  const fresh: ConversionInput[] = [];
  for (const event of events) {
    const problem = problemWith(event, now);
    if (problem) outcomes.set(event.id, problem);
    else fresh.push(event);
  }
  for (let i = 0; i < fresh.length; i += BATCH) {
    const batch = fresh.slice(i, i + BATCH);
    try {
      await graph.post(`${datasetId}/events`, {
        data: batch.map((e) => conversionPayload(access, e)),
      });
      for (const e of batch) outcomes.set(e.id, { id: e.id, status: 'sent' });
    } catch (error) {
      // Only a request Meta refused for good fails these events; the rest stay pending upstream.
      if (!(error instanceof PlatformError) || error.kind !== 'invalid') throw error;
      for (const e of batch) {
        outcomes.set(e.id, { id: e.id, status: 'failed', error: error.message });
      }
    }
  }
  return events.map((e) => outcomes.get(e.id) as ConversionOutcome);
}
