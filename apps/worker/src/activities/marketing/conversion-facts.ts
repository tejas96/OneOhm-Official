import {
  type AdProvider,
  type ConversionEvent,
  type LeadStage,
  reachedEvents,
} from '@oneohm/domain';

/** What is known about one ad lead's sale, gathered from the other tables. */
export interface AdLeadFacts {
  readonly stage: LeadStage;
  readonly ctwaClid: string | null;
  readonly fbclid: string | null;
  readonly gclid: string | null;
  readonly platformLeadId: string | null;
  /** The lead's campaign (by its code) runs on Meta (a goal other than a plain post, placed). */
  readonly campaignOnMeta: boolean;
  /** When the earliest survey visit is, if one was booked. */
  readonly surveyAt: Date | null;
  readonly surveyBooked: boolean;
  /** When the first quotation went out, and the latest sent one's total. */
  readonly quoteSentAt: Date | null;
  readonly quotedPaise: number | null;
  /** The paid advance: when and how much. Null while it is unpaid. */
  readonly advance: { readonly paidAt: Date; readonly amountPaise: number } | null;
  readonly wonAt: Date | null;
  /** When the lead came and when it last changed: the best guess for a step with no time. */
  readonly leadCreatedAt: Date;
  readonly leadUpdatedAt: Date;
  /** The accepted quotation's total. */
  readonly wonPaise: number | null;
}

export interface NewConversion {
  readonly provider: AdProvider;
  readonly event: ConversionEvent;
  readonly eventAt: Date;
  readonly valuePaise: number | null;
}

/** Which platforms hear about this lead: Meta for its click ids and forms, Google for gclid. */
export function providersFor(facts: AdLeadFacts): AdProvider[] {
  const googleId = Boolean(facts.gclid) || Boolean(facts.platformLeadId?.startsWith('google:'));
  const providers: AdProvider[] = [];
  // A Meta campaign counts only when nothing says the lead came from Google.
  const meta =
    Boolean(facts.ctwaClid || facts.fbclid) ||
    Boolean(facts.platformLeadId?.startsWith('meta:')) ||
    (facts.campaignOnMeta && !googleId);
  if (meta) providers.push('meta');
  if (googleId) providers.push('google');
  return providers;
}

/** A lead older than this gets no "now" time: its steps happened long ago. */
const RECENT_MS = 7 * 86_400_000;

const earliest = (...times: (Date | null)[]): Date | null => {
  const known = times.filter((time): time is Date => time !== null);
  return known.length === 0 ? null : new Date(Math.min(...known.map((time) => time.getTime())));
};

/**
 * The best time for a step: its own, else the earliest time of a later step that implies it.
 * With none, a recent lead uses now; an older one uses the lead's own latest known time, never now.
 */
function stepTime(own: Date | null, implied: Date | null, facts: AdLeadFacts, now: Date): Date {
  const known = own ?? implied;
  const recent = now.getTime() - facts.leadCreatedAt.getTime() <= RECENT_MS;
  const best =
    known ??
    (recent
      ? now
      : new Date(Math.max(facts.leadCreatedAt.getTime(), facts.leadUpdatedAt.getTime())));
  return new Date(Math.min(best.getTime(), now.getTime()));
}

/**
 * The sale steps to tell each platform: every step reached, with when and what it was worth.
 * No time is ever in the future (platforms refuse those).
 */
export function conversionsFor(facts: AdLeadFacts, now: Date): NewConversion[] {
  const providers = providersFor(facts);
  if (providers.length === 0) return [];
  const events = reachedEvents(facts.stage, {
    surveyBooked: facts.surveyBooked,
    quoteSent: facts.quoteSentAt !== null,
    advancePaid: facts.advance !== null,
    won: facts.wonAt !== null,
  });
  const paidAt = facts.advance?.paidAt ?? null;
  const wonAt = facts.wonAt;
  const detail: Record<ConversionEvent, { at: Date; value: number | null }> = {
    survey: {
      at: stepTime(facts.surveyAt, earliest(facts.quoteSentAt, paidAt, wonAt), facts, now),
      value: null,
    },
    quoted: {
      at: stepTime(facts.quoteSentAt, earliest(paidAt, wonAt), facts, now),
      value: facts.quotedPaise,
    },
    advance_paid: {
      at: stepTime(paidAt, wonAt, facts, now),
      value: facts.advance?.amountPaise ?? null,
    },
    won: { at: stepTime(wonAt, null, facts, now), value: facts.wonPaise },
  };
  return events.flatMap((event) =>
    providers.map((provider) => ({
      provider,
      event,
      eventAt: detail[event].at,
      valuePaise: detail[event].value,
    })),
  );
}

/** The platform's own lead id, without our `meta:` / `google:` prefix. */
export const bareLeadId = (platformLeadId: string | null): string | null =>
  platformLeadId ? platformLeadId.replace(/^(meta|google):/, '') : null;

/** Where a conversion stands after a try that threw: waits for a retry, or gives up at five. */
export const MAX_ATTEMPTS = 5;

/** A "not now" that is about our setup (no dataset, steps not set up), not about the step itself. */
export const isSetupGap = (words: string): boolean =>
  /dataset|not set up|set up yet|connect \w+ again/i.test(words);

export function afterFailedTry(
  attempts: number,
  words: string,
  permanent: boolean,
  /** A setup gap: wait without counting a try. */
  uncounted = false,
): {
  readonly status: 'pending' | 'failed';
  readonly attempts: number;
  readonly lastError: string;
} {
  if (uncounted) return { status: 'pending', attempts, lastError: words };
  const next = attempts + 1;
  return {
    status: permanent || next >= MAX_ATTEMPTS ? 'failed' : 'pending',
    attempts: next,
    lastError: words,
  };
}
