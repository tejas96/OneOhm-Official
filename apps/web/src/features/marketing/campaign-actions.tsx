'use client';

import type { CampaignCard } from '@oneohm/api-contracts';
import { Button, Popover } from '@oneohm/design-system/web';
import { Pause, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { availableActions } from './marketing-words';
import { useCampaignAction } from './use-marketing';

/**
 * Pause, Run again and Stop for one campaign, only the ones that make sense now. Stop asks once,
 * in a small note, because it cannot be undone (but it can be run again later).
 */
export function CampaignActions({
  card,
  onDone,
}: {
  readonly card: Pick<CampaignCard, 'id' | 'actions'>;
  /** Runs after a button is pressed, e.g. to keep a card's own click from opening it. */
  readonly onDone?: () => void;
}) {
  const t = useTranslations('marketing');
  const change = useCampaignAction();
  const [confirming, setConfirming] = useState(false);
  const go = (action: 'pause' | 'stop' | 'runAgain') => {
    change.mutate({ action, id: card.id });
    onDone?.();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {availableActions(card).map((action) => {
        if (action === 'pause')
          return (
            <Button key={action} size="sm" leadingIcon={<Pause />} onClick={() => go('pause')}>
              {t('actions.pause')}
            </Button>
          );
        if (action === 'runAgain')
          return (
            <Button
              key={action}
              size="sm"
              variant="primary"
              leadingIcon={<Play />}
              onClick={() => go('runAgain')}
            >
              {t('actions.runAgain')}
            </Button>
          );
        return (
          <Popover
            key={action}
            label={t('actions.stopLabel')}
            open={confirming}
            onOpenChange={setConfirming}
            trigger={
              <Button size="sm" variant="quiet" leadingIcon={<Square />}>
                {t('actions.stop')}
              </Button>
            }
          >
            <div className="flex w-64 flex-col gap-3">
              <p className="type-body text-ink">{t('actions.stopAsk')}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => {
                    setConfirming(false);
                    go('stop');
                  }}
                >
                  {t('actions.stopYes')}
                </Button>
                <Button size="sm" variant="quiet" onClick={() => setConfirming(false)}>
                  {t('actions.keep')}
                </Button>
              </div>
            </div>
          </Popover>
        );
      })}
    </div>
  );
}
