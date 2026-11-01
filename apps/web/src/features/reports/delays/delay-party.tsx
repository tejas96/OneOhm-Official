'use client';

import { cn } from '@oneohm/design-system/web';
import type { WaitingParty } from '@oneohm/domain';
import { useTranslations } from 'next-intl';

/** Internal, customer, bank, DISCOM: the order every delay view uses. */
export const PARTIES = ['internal', 'customer', 'bank', 'discom'] as const;

export const PARTY_FILL: Readonly<Record<WaitingParty, string>> = {
  internal: 'bg-party-internal',
  customer: 'bg-party-customer',
  bank: 'bg-party-bank',
  discom: 'bg-party-discom',
};

/** The cause's colour square, for a legend or a tile label. */
export function PartySwatch({ party }: { readonly party: WaitingParty }) {
  return <span aria-hidden className={cn('size-2.5 rounded-[3px]', PARTY_FILL[party])} />;
}

/** The cause as colour and word together, never colour alone. */
export function PartyTag({ party }: { readonly party: WaitingParty }) {
  const t = useTranslations('delaysReport.party');
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap type-body-sm text-ink-muted">
      <PartySwatch party={party} />
      {t(party)}
    </span>
  );
}
