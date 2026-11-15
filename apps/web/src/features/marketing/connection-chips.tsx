'use client';

import type { MarketingOverview } from '@oneohm/api-contracts';
import { StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { CONNECTION_TONE } from './marketing-words';

/** Meta and Google in one word each; a tap goes to Connections to fix or see more. */
export function ConnectionChips({
  connections,
  onOpen,
}: {
  readonly connections: MarketingOverview['connections'];
  readonly onOpen: () => void;
}) {
  const t = useTranslations('marketing');
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(['meta', 'google'] as const).map((provider) => {
        const status = connections[provider];
        return (
          <button
            key={provider}
            type="button"
            onClick={onOpen}
            className="rounded-full outline-offset-2 transition-transform active:scale-[0.97]"
          >
            <StatusPill
              tone={CONNECTION_TONE[status]}
              size="sm"
              label={t('chip', {
                place: t(`provider.${provider}`),
                state: t(`connection.${status}`),
              })}
            />
          </button>
        );
      })}
    </div>
  );
}
