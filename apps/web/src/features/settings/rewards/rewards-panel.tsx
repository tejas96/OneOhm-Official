'use client';

import { useTranslations } from 'next-intl';
import { OtherRewards } from './other-rewards';
import { PointsMeaning } from './points-meaning';
import { PointsSection } from './points-section';

/**
 * Rewards, points and referral programmes in one place (PRD 7.2): what earns points and
 * who approves them, what points mean, and the rewards that pay money.
 */
export function RewardsPanel() {
  const t = useTranslations('settings.rewards');
  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <p className="max-w-2xl type-body text-ink-muted">{t('intro')}</p>
      <PointsSection />
      <PointsMeaning />
      <OtherRewards />
    </div>
  );
}
