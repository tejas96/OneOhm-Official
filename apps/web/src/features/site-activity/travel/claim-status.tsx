'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { type PillTone, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type ClaimState, claimState } from './use-travel';

const TONE: Readonly<Record<ClaimState, PillTone>> = {
  pending: 'review',
  approved: 'waiting',
  paid: 'done',
  rejected: 'overdue',
  cancelled: 'neutral',
};

export function ClaimStatus({ claim }: { readonly claim: TravelClaim }) {
  const t = useTranslations('siteActivity.claims.status');
  const state = claimState(claim);
  return <StatusPill tone={TONE[state]} size="sm" label={t(state)} />;
}
