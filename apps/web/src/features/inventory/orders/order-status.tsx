'use client';

import type { PurchaseOrderStatus } from '@oneohm/api-contracts';
import { type PillTone, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

const TONE: Readonly<Record<PurchaseOrderStatus, PillTone>> = {
  draft: 'neutral',
  sent: 'waiting',
  partly_received: 'atRisk',
  received: 'done',
  closed: 'done',
  cancelled: 'blocked',
};

export function OrderStatusPill({ status }: { readonly status: PurchaseOrderStatus }) {
  const t = useTranslations('inventory.orders.statuses');
  return <StatusPill tone={TONE[status]} label={t(status)} size="sm" />;
}
