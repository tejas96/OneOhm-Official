'use client';

import type { CampaignPlacement } from '@oneohm/api-contracts';
import { Button, cn } from '@oneohm/design-system/web';
import { CircleAlert, CircleCheck, Clock3 } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Each place a campaign runs: a tick or its plain-words problem, with Try again when it failed. */
export function PlacementList({
  placements,
  canRetry,
  retrying,
  onRetry,
}: {
  readonly placements: readonly CampaignPlacement[];
  readonly canRetry: boolean;
  readonly retrying: boolean;
  readonly onRetry: () => void;
}) {
  const t = useTranslations('marketing');
  return (
    <ul className="flex flex-col gap-2">
      {placements.map((place) => {
        const failed = place.state === 'failed';
        const waiting = place.state === 'pending' || place.state === 'in_review';
        const Icon = failed ? CircleAlert : waiting ? Clock3 : CircleCheck;
        return (
          <li
            key={place.provider}
            className={cn(
              'flex items-start gap-3 rounded-xl border p-3',
              failed ? 'border-overdue/30 bg-overdue-tint' : 'border-hairline bg-raised',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'mt-0.5 size-5 shrink-0',
                failed ? 'text-overdue' : waiting ? 'text-review' : 'text-on-track',
              )}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="type-body font-medium text-ink">
                {t(`placeLong.${place.provider}`)}
                <span className="font-normal text-ink-muted">
                  {' '}
                  · {t(`placeState.${place.state}`)}
                </span>
              </p>
              {failed && place.error && <p className="type-body-sm text-overdue">{place.error}</p>}
              {place.notes.map((note) => (
                <p key={note} className="type-body-sm text-ink-muted">
                  {note}
                </p>
              ))}
              {failed && canRetry && (
                <div className="pt-1">
                  <Button size="sm" variant="secondary" pending={retrying} onClick={onRetry}>
                    {t('tryAgain')}
                  </Button>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
