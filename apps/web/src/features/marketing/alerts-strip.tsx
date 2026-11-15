'use client';

import type { MarketingAlert } from '@oneohm/api-contracts';
import { Button, listItemEnter } from '@oneohm/design-system/web';
import { BellRing, ExternalLink, PlugZap, TriangleAlert, Wallet } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { isOutsideLink } from './marketing-words';

const ICON = {
  no_leads: BellRing,
  low_balance: Wallet,
  reconnect: PlugZap,
  account_problem: TriangleAlert,
  needs_attention: TriangleAlert,
} as const satisfies Record<MarketingAlert['kind'], unknown>;

/**
 * Things worth a look, each calm and with one action: top up opens the outside page in a new
 * tab, reconnect goes to Connections, a campaign alert opens that campaign.
 */
export function AlertsStrip({
  alerts,
  onConnections,
  onCampaign,
}: {
  readonly alerts: readonly MarketingAlert[];
  readonly onConnections: () => void;
  readonly onCampaign: (id: string) => void;
}) {
  const t = useTranslations('marketing');
  if (alerts.length === 0) return null;
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label={t('alerts.label')}>
      {alerts.map((alert, index) => {
        const Icon = ICON[alert.kind];
        const outside = alert.href !== null && isOutsideLink(alert.href);
        return (
          <motion.li
            key={`${alert.kind}-${alert.campaignId ?? alert.title}`}
            {...listItemEnter(index)}
            className="flex items-start gap-3 rounded-xl border border-hairline bg-at-risk-tint/60 p-4"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-raised text-at-risk [&_svg]:size-4">
              <Icon aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="type-title-md text-ink">{alert.title}</p>
              <p className="type-body-sm text-ink-muted">{alert.body}</p>
              <div className="pt-1">
                {outside && alert.href ? (
                  <Button asChild size="sm" variant="secondary" trailingIcon={<ExternalLink />}>
                    <a href={alert.href} target="_blank" rel="noopener noreferrer">
                      {t('alerts.topUp')}
                    </a>
                  </Button>
                ) : alert.campaignId ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onCampaign(alert.campaignId ?? '')}
                  >
                    {t('alerts.open')}
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={onConnections}>
                    {t(alert.kind === 'reconnect' ? 'alerts.reconnect' : 'alerts.review')}
                  </Button>
                )}
              </div>
            </div>
          </motion.li>
        );
      })}
    </ul>
  );
}
