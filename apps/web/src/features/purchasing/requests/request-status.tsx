'use client';

import type { PurchaseRequestStatus } from '@oneohm/api-contracts';
import { type PillTone, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

const TONE: Readonly<Record<PurchaseRequestStatus, PillTone>> = {
  pending: 'review',
  approved: 'onTrack',
  rejected: 'blocked',
  ordered: 'done',
  cancelled: 'neutral',
};

export function RequestStatusPill({ status }: { readonly status: PurchaseRequestStatus }) {
  const t = useTranslations('purchasing.requests.status');
  return <StatusPill size="sm" tone={TONE[status]} label={t(status)} />;
}
