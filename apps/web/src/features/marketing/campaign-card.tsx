'use client';

import type { CampaignCard as Card } from '@oneohm/api-contracts';
import { listItemEnter } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { CampaignActions } from './campaign-actions';
import { CampaignThumb } from './campaign-thumb';
import { ChannelRow } from './channel-icons';
import { CountValue } from './count-value';
import { LookPill } from './look-pill';
import { cardNumbers } from './marketing-words';

/**
 * One campaign: photo, name, where it runs, its status, four numbers and the one-tap actions.
 * The whole card opens the details; the buttons do not.
 */
export function CampaignCard({
  card,
  index,
  onOpen,
}: {
  readonly card: Card;
  readonly index: number;
  readonly onOpen: () => void;
}) {
  const t = useTranslations('marketing');
  return (
    <motion.li
      layout
      {...listItemEnter(index)}
      className="group @container relative flex flex-col gap-4 rounded-xl border border-hairline bg-raised p-4 transition-[box-shadow,border-color,transform] duration-(--duration-base) ease-standard hover:-translate-y-0.5 hover:border-rule hover:shadow-e2"
    >
      <div className="flex items-start gap-3">
        <CampaignThumb url={card.mediaUrl} kind={card.mediaKind} className="size-16" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <button
            type="button"
            onClick={onOpen}
            className="oh-stretched-link truncate text-left type-title-md text-ink outline-offset-4"
          >
            {card.name}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <LookPill card={card} />
            <ChannelRow channels={card.channels} />
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 @sm:grid-cols-4">
        {cardNumbers(card.numbers).map((number) => (
          <div key={number.key} className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate type-body-sm text-ink-faint">{t(`numbers.${number.key}`)}</dt>
            <dd className="truncate type-title-md text-ink tabular-nums">
              <CountValue value={number.value} money={number.money} />
            </dd>
          </div>
        ))}
      </dl>
      {(card.actions.pause || card.actions.stop || card.actions.runAgain) && (
        <div className="relative z-10">
          <CampaignActions card={card} />
        </div>
      )}
    </motion.li>
  );
}
