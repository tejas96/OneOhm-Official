import type { CampaignDefaults } from '@oneohm/api-contracts';
import { MESSAGE_SEGMENTS, SEGMENT_TEMPLATE } from '@oneohm/domain';

type Ready = CampaignDefaults['ready'];

/** What the server knows about each place before the screen offers it. */
export interface ReadyFacts {
  readonly mode: 'live' | 'sandbox';
  readonly meta: {
    readonly appKeys: boolean;
    readonly usable: boolean;
    readonly instagramId: string | null;
    readonly pageId: string | null;
  };
  readonly google: { readonly appKeys: boolean; readonly usable: boolean };
  readonly whatsappToken: boolean;
  /** Keys of the segment templates that are switched on. */
  readonly activeTemplates: ReadonlySet<string>;
}

const OFFER_KEYS = MESSAGE_SEGMENTS.map((segment) => SEGMENT_TEMPLATE[segment]);

function whyNot(facts: ReadyFacts, metaOn: boolean): Record<string, string> {
  return {
    instagram: metaOn
      ? 'Connect an Instagram account to your Facebook page in Meta first.'
      : 'Connect Meta first',
    facebook: metaOn ? 'Pick a Facebook page in Connections first.' : 'Connect Meta first',
    google: 'Connect Google first',
    whatsapp: facts.whatsappToken
      ? "Your WhatsApp offer messages are waiting for Meta's approval"
      : 'WhatsApp is not set up on this server yet',
  };
}

/** Which places can run now, and the plain reason for each that cannot. */
export function readyPlaces(facts: ReadyFacts): { ready: Ready; why: Record<string, string> } {
  const sandbox = facts.mode === 'sandbox';
  const metaOn = facts.meta.usable && (sandbox || facts.meta.appKeys);
  const ready: Ready = {
    instagram: metaOn && (sandbox || Boolean(facts.meta.instagramId)),
    facebook: metaOn && (sandbox || Boolean(facts.meta.pageId)),
    google: facts.google.usable && (sandbox || facts.google.appKeys),
    whatsapp:
      sandbox || (facts.whatsappToken && OFFER_KEYS.every((key) => facts.activeTemplates.has(key))),
  };
  const reasons = whyNot(facts, metaOn);
  const why = Object.fromEntries(
    Object.entries(reasons).filter(([channel]) => !ready[channel as keyof Ready]),
  );
  return { ready, why };
}
