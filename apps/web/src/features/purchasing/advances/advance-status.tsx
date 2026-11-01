'use client';

import type { VendorAdvance } from '@oneohm/api-contracts';
import { type PillTone, StatusPill } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

const TONE: Readonly<Record<VendorAdvance['status'], PillTone>> = {
  pending: 'review',
  approved: 'onTrack',
  paid: 'done',
  cancelled: 'neutral',
};

/** Paid advances read "Open" until bills use them up, then "Used". */
export function AdvanceStatusPill({ advance }: { readonly advance: VendorAdvance }) {
  const t = useTranslations('purchasing.advances.status');
  if (advance.status === 'paid') {
    const used = advance.openPaise === 0;
    return (
      <StatusPill size="sm" tone={used ? 'done' : 'waiting'} label={t(used ? 'used' : 'open')} />
    );
  }
  return <StatusPill size="sm" tone={TONE[advance.status]} label={t(advance.status)} />;
}
