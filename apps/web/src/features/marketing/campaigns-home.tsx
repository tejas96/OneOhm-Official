'use client';

import type { MarketingOverview } from '@oneohm/api-contracts';
import { Sheet } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LeadCampaignsPanel } from '@/features/settings/lead-campaigns/lead-campaigns-panel';
import { ReferralsPanel } from '@/features/settings/referrals/referrals-panel';
import { AlertsStrip } from './alerts-strip';
import { CampaignCard } from './campaign-card';
import { CampaignsEmpty } from './campaigns-empty';
import { PracticeRibbon } from './practice-ribbon';
import { ReviewsCard } from './reviews-card';
import { CodesCard, ReferralCard } from './side-cards';
import { TotalsStrip } from './totals-strip';

/** Campaigns, then the other ways leads come: refer and earn, poster codes, Google reviews. */
export function CampaignsHome({
  overview,
  onNew,
  onConnections,
  onCampaign,
}: {
  readonly overview: MarketingOverview;
  readonly onNew: () => void;
  readonly onConnections: () => void;
  readonly onCampaign: (id: string) => void;
}) {
  const t = useTranslations('marketing');
  const [sheet, setSheet] = useState<'referral' | 'codes' | null>(null);
  const cards = overview.campaigns;
  const sideStart = cards.length;
  return (
    <div className="flex flex-col gap-6">
      {overview.mode === 'sandbox' && <PracticeRibbon />}
      <AlertsStrip alerts={overview.alerts} onConnections={onConnections} onCampaign={onCampaign} />
      {cards.length === 0 ? (
        <CampaignsEmpty
          metaConnected={overview.connections.meta === 'connected'}
          onNew={onNew}
          onConnections={onConnections}
        />
      ) : (
        <TotalsStrip totals={overview.totals} />
      )}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card, index) => (
          <CampaignCard
            key={card.id}
            card={card}
            index={index}
            onOpen={() => onCampaign(card.id)}
          />
        ))}
        {overview.referral && (
          <ReferralCard
            referral={overview.referral}
            index={sideStart}
            onOpen={() => setSheet('referral')}
          />
        )}
        <CodesCard codes={overview.codes} index={sideStart + 1} onOpen={() => setSheet('codes')} />
        <ReviewsCard
          reviews={overview.reviews}
          index={sideStart + 2}
          onConnections={onConnections}
        />
      </ul>
      <Sheet
        open={sheet === 'referral'}
        onOpenChange={(open) => !open && setSheet(null)}
        title={t('referral.title')}
        width="lg"
      >
        <div className="p-5 sm:p-6">{sheet === 'referral' && <ReferralsPanel />}</div>
      </Sheet>
      <Sheet
        open={sheet === 'codes'}
        onOpenChange={(open) => !open && setSheet(null)}
        title={t('codes.title')}
        width="lg"
      >
        <div className="p-5 sm:p-6">{sheet === 'codes' && <LeadCampaignsPanel />}</div>
      </Sheet>
    </div>
  );
}
