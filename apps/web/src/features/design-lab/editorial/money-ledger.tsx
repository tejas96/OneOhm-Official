'use client';

import { ShareBar } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { PREVIEW } from '../../command-center/preview-data';
import { MONEY } from '../lab-data';
import { SectionHeading } from './section-heading';

const PARTIES = ['discom', 'internal', 'customer', 'bank'] as const;
const PARTY_FILL = {
  internal: 'bg-party-internal',
  customer: 'bg-party-customer',
  bank: 'bg-party-bank',
  discom: 'bg-party-discom',
} as const;

/** Money as a ledger with leader dots, and waiting time as one split line. */
export function MoneyAndWaiting() {
  const t = useTranslations('lab.editorial');
  const partyT = useTranslations('commandCenter.attention.party');
  const rows = [
    { key: 'collected', value: MONEY.collected },
    { key: 'stillDue', value: MONEY.stillDue },
    { key: 'fromBanks', value: MONEY.receivables.bank },
    { key: 'toVendors', value: MONEY.payables.vendors },
    { key: 'toContractors', value: MONEY.payables.contractors },
  ] as const;
  const days = PREVIEW.waitingDays;
  const total = PARTIES.reduce((sum, party) => sum + days[party], 0);
  return (
    <div className="grid gap-12 lg:grid-cols-2">
      <section aria-label={t('moneyTitle')} className="flex flex-col gap-5">
        <SectionHeading index="02" title={t('moneyTitle')} />
        <dl className="flex flex-col">
          {rows.map((row) => (
            <div key={row.key} className="flex items-baseline gap-3 py-2.5">
              <dt className="type-body text-ink-muted">{t(`money.${row.key}`)}</dt>
              <span aria-hidden className="flex-1 border-b border-dotted border-rule" />
              <dd className="type-display-md text-ink tabular-nums">
                {formatInrCompact(row.value)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label={t('waitingTitle')} className="flex flex-col gap-5">
        <SectionHeading index="03" title={t('waitingTitle')} />
        <p className="type-display-md text-pretty text-ink">
          {t('waitingHeadline', { percent: Math.round((days.discom / total) * 100) })}
        </p>
        <ShareBar
          legend="rows"
          label={t('waitingAria', { total })}
          format={(value) => t('days', { count: value })}
          segments={PARTIES.map((party) => ({
            key: party,
            label: partyT(party),
            value: days[party],
            colorClassName: PARTY_FILL[party],
          }))}
        />
      </section>
    </div>
  );
}
