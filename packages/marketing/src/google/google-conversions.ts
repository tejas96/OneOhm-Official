import { hashPhoneFor } from '../hashing';
import type { ConversionInput, ConversionOutcome } from '../types';
import type { GoogleContext } from './google-context';
import { googleEmailHash } from './google-email';
import { googleCodes, googleMessage } from './google-errors';

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const INDIA_OFFSET = 5.5 * 60 * 60 * 1000;

/** `yyyy-mm-dd hh:mm:ss+05:30`, the time as it was in India. */
export function indiaTime(date: Date): string {
  const shifted = new Date(date.getTime() + INDIA_OFFSET);
  return `${shifted.toISOString().slice(0, 19).replace('T', ' ')}+05:30`;
}

type Row = Pick<ConversionOutcome, 'status' | 'error'>;

const ALREADY = /DUPLICATE|ALREADY/;
const LATER = /TOO_RECENT|INTERNAL_ERROR|TRANSIENT|CONCURRENT_MODIFICATION|TEMPORARILY|NOT_YET/;

/** What one refused row means: already recorded counts as sent, "too soon" waits, else failed. */
function judge(code: string | undefined, words: string): Row {
  if (code && ALREADY.test(code)) return { status: 'sent' };
  if (code && LATER.test(code)) return { status: 'retry', error: words };
  return { status: 'failed', error: words };
}

/** The row an error names (when it does) and what it means. */
// biome-ignore lint/suspicious/noExplicitAny: Google's JSON is read field by field.
function readItem(item: any): { readonly index: number | undefined; readonly row: Row } {
  const index = item?.location?.fieldPathElements?.find(
    (part: { index?: number }) => typeof part?.index === 'number',
  )?.index;
  const one = { error: { details: [{ errors: [item] }] } };
  const code = googleCodes(one).pop();
  return {
    index,
    row: judge(code, googleMessage(one) || `Google refused it (${code ?? 'unknown'}).`),
  };
}

/** Which sent conversion each failure belongs to, with Google's words. */
function failuresOf(error: Record<string, unknown> | undefined): {
  readonly byIndex: Map<number, Row>;
  readonly general: Row | null;
} {
  const byIndex = new Map<number, Row>();
  let general: Row | null = null;
  if (!error) return { byIndex, general };
  // biome-ignore lint/suspicious/noExplicitAny: Google's JSON is read field by field.
  const details = ((error as any).details ?? []) as any[];
  for (const detail of details) {
    for (const item of detail?.errors ?? []) {
      const { index, row } = readItem(item);
      if (typeof index === 'number') {
        if (!byIndex.has(index)) byIndex.set(index, row);
      } else general ??= row;
    }
  }
  if (byIndex.size === 0 && !general) {
    general = {
      status: 'failed',
      error: String((error as { message?: string }).message ?? 'Google refused it.'),
    };
  }
  return { byIndex, general: byIndex.size === 0 ? general : null };
}

/** One click conversion; hashed phone and email only when enhanced conversions for leads is on. */
function payloadFor(ctx: GoogleContext, event: ConversionInput, action: string): unknown {
  const enhanced = ctx.access.details.enhancedConversionsForLeads === true;
  const email = googleEmailHash(event.email);
  return {
    gclid: event.gclid,
    conversionAction: action,
    conversionDateTime: indiaTime(event.eventAt),
    ...(event.valuePaise !== null
      ? { conversionValue: event.valuePaise / 100, currencyCode: 'INR' }
      : {}),
    orderId: event.id,
    ...(enhanced
      ? {
          userIdentifiers: [
            { hashedPhoneNumber: hashPhoneFor('google', event.phoneE164) },
            ...(email ? [{ hashedEmail: email }] : []),
          ],
        }
      : {}),
  };
}

/** Tells Google about sale steps (offline click conversions). Each event gets its own outcome. */
export async function sendGoogleConversions(
  ctx: GoogleContext,
  events: readonly ConversionInput[],
): Promise<ConversionOutcome[]> {
  const outcomes = new Map<string, ConversionOutcome>();
  const sending: { readonly event: ConversionInput; readonly payload: unknown }[] = [];
  const actions = ctx.access.details.conversionActions ?? {};
  const skip = (event: ConversionInput, error: string) =>
    outcomes.set(event.id, { id: event.id, status: 'skipped', error });

  for (const event of events) {
    const action = actions[event.event];
    if (!event.gclid) skip(event, 'No Google click on this lead');
    else if (!action)
      skip(event, 'Google conversion steps are not set up yet; connect Google again');
    else if (Date.now() - event.leadCreatedAt.getTime() > NINETY_DAYS)
      skip(event, 'Google only takes sale steps within 90 days of the click');
    else {
      sending.push({ event, payload: payloadFor(ctx, event, action) });
    }
  }

  if (sending.length > 0) {
    const answer = await ctx.client.post(
      `customers/${ctx.access.customerId}:uploadClickConversions`,
      { conversions: sending.map((item) => item.payload), partialFailure: true },
    );
    const failures = failuresOf(answer.partialFailureError);
    sending.forEach(({ event }, index) => {
      const why = failures.byIndex.get(index) ?? failures.general;
      outcomes.set(event.id, { id: event.id, ...(why ?? { status: 'sent' as const }) });
    });
  }
  return events.map((event) => outcomes.get(event.id) as ConversionOutcome);
}
