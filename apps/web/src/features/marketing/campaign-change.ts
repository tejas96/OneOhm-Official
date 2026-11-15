import type { CampaignCard } from '@oneohm/api-contracts';
import type { CampaignLook, CampaignState } from '@oneohm/domain';
import { campaignActions } from '@oneohm/domain';
import type { CardAction } from './marketing-words';

const AFTER: Record<CardAction, { state: CampaignState; look: CampaignLook }> = {
  pause: { state: 'paused', look: 'paused' },
  stop: { state: 'stopped', look: 'stopped' },
  runAgain: { state: 'launching', look: 'starting' },
};

/**
 * What a card looks like the moment a button is tapped, before the server answers: the
 * new status word and only the buttons that still make sense. A wrong guess is rolled back.
 */
export function optimisticCard(card: CampaignCard, action: CardAction): CampaignCard {
  const next = AFTER[action];
  const actions =
    action === 'runAgain'
      ? { pause: false, stop: false, runAgain: false }
      : campaignActions(next.state);
  return { ...card, state: next.state, look: next.look, actions };
}

/** The list with one card swapped for `change(card)`; other cards stay the same objects. */
export function changeCard(
  cards: readonly CampaignCard[],
  id: string,
  change: (card: CampaignCard) => CampaignCard,
): CampaignCard[] {
  return cards.map((card) => (card.id === id ? change(card) : card));
}
