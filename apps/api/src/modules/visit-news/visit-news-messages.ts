import { titleCaseName } from '@oneohm/shared';
import type { Built } from '../send-to-customer/send-messages';
import { visitCheckTaps } from './visit-check-taps';
import { VISIT_NEWS_WORDS } from './visit-news-words';

/**
 * The site visit messages (Duty Day step 6) as the customer reads them: the chat message for
 * inside the 24-hour window, and the approved template for outside it. Built in the customer's
 * language (the caller runs them inside `inLanguage`).
 */
interface Said {
  readonly customer: string;
  readonly worker: string;
  readonly home: string;
}

const named = (given: Said) => ({
  customer: titleCaseName(given.customer),
  worker: given.worker,
  home: given.home,
});

/** "Ravi from OneOhm is on the way to Sangli. Expected in about 15 min." [Track live]. */
export function onWayMessage(
  given: Said & { readonly minutes: number; readonly token: string; readonly url: string },
): Built {
  const words = VISIT_NEWS_WORDS;
  return {
    replies: [
      {
        kind: 'cta_url',
        body: words.onWay(given.worker, given.home, given.minutes),
        label: words.track,
        url: given.url,
      },
    ],
    template: {
      key: 'worker_on_way',
      payload: { ...named(given), minutes: String(given.minutes), trackToken: given.token },
    },
  };
}

/** "Ravi from OneOhm has reached Sangli." */
export function arrivedMessage(given: Said): Built {
  return {
    replies: [{ kind: 'text', body: VISIT_NEWS_WORDS.arrived(given.worker, given.home) }],
    template: { key: 'worker_arrived', payload: named(given) },
  };
}

/** "Ravi from OneOhm visited Sangli today. Was this visit done?" [Yes, visited] [No]. */
export function checkMessage(given: Said & { readonly siteVisitId: string }): Built {
  const words = VISIT_NEWS_WORDS;
  const yes = visitCheckTaps.yes(given.siteVisitId);
  const no = visitCheckTaps.no(given.siteVisitId);
  return {
    replies: [
      {
        kind: 'buttons',
        body: words.check(given.worker, given.home),
        buttons: [
          { id: yes, title: words.yes },
          { id: no, title: words.no },
        ],
      },
    ],
    template: { key: 'visit_check', payload: { ...named(given), yesPayload: yes, noPayload: no } },
  };
}
