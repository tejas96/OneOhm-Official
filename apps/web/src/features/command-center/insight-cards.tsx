'use client';

import { Card, CardHeader, easing, ShareBar, seconds } from '@oneohm/design-system/web';
import { formatInrCompact } from '@oneohm/shared';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type Party, PREVIEW } from './preview-data';

const PARTIES: readonly Party[] = ['discom', 'internal', 'customer', 'bank'];
const PARTY_FILL: Readonly<Record<Party, string>> = {
  internal: 'bg-party-internal',
  customer: 'bg-party-customer',
  bank: 'bg-party-bank',
  discom: 'bg-party-discom',
};

/** Who projects waited on this month. Only internal time counts against the team. */
export function WaitingCard() {
  const t = useTranslations('commandCenter.waiting');
  const partyT = useTranslations('commandCenter.attention.party');
  const days = PREVIEW.waitingDays;
  const total = PARTIES.reduce((sum, party) => sum + days[party], 0);
  const discomShare = Math.round((days.discom / total) * 100);
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} description={t('description')} />
      <div className="flex flex-1 flex-col gap-5 px-5 pb-5">
        <p className="type-display-md text-ink">
          {t('headline', { party: partyT('discom'), percent: discomShare })}
        </p>
        <ShareBar
          label={t('aria', { total })}
          legend="rows"
          format={(value) => t('days', { count: value })}
          segments={PARTIES.map((party) => ({
            key: party,
            label: partyT(party),
            value: days[party],
            colorClassName: PARTY_FILL[party],
          }))}
        />
        <p className="mt-auto type-body-sm text-ink-faint">{t('footnote')}</p>
      </div>
    </Card>
  );
}

/** Money owed to OneOhm (by payer) and money OneOhm owes this week. */
export function MoneyCard() {
  const t = useTranslations('commandCenter.money');
  const { receivables, payablesThisWeek } = PREVIEW.money;
  const receivableTotal = receivables.customer + receivables.bank;
  const payableTotal = payablesThisWeek.vendors + payablesThisWeek.contractors;
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} description={t('description')} />
      <div className="flex flex-col gap-6 px-5 pb-5">
        <div className="flex flex-col gap-3">
          <p className="flex items-baseline justify-between gap-3">
            <span className="type-body-sm text-ink-muted">{t('receivables')}</span>
            <span className="type-display-md text-ink tabular-nums">
              {formatInrCompact(receivableTotal)}
            </span>
          </p>
          <ShareBar
            label={t('receivablesAria')}
            format={formatInrCompact}
            segments={[
              {
                key: 'customer',
                label: t('fromCustomers'),
                value: receivables.customer,
                colorClassName: 'bg-accent',
              },
              {
                key: 'bank',
                label: t('fromBanks'),
                value: receivables.bank,
                colorClassName: 'bg-party-bank',
              },
            ]}
          />
        </div>
        <div className="flex flex-col gap-3 border-t border-hairline pt-5">
          <p className="flex items-baseline justify-between gap-3">
            <span className="type-body-sm text-ink-muted">{t('payables')}</span>
            <span className="type-display-md text-ink tabular-nums">
              {formatInrCompact(payableTotal)}
            </span>
          </p>
          <ShareBar
            label={t('payablesAria')}
            format={formatInrCompact}
            segments={[
              {
                key: 'vendors',
                label: t('toVendors'),
                value: payablesThisWeek.vendors,
                colorClassName: 'bg-swatch-3',
              },
              {
                key: 'contractors',
                label: t('toContractors'),
                value: payablesThisWeek.contractors,
                colorClassName: 'bg-swatch-1',
              },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}

const PIPELINE_STEPS = ['leads', 'surveys', 'quotations', 'accepted'] as const;
const STEP_FILL = ['bg-accent/30', 'bg-accent/50', 'bg-accent/75', 'bg-accent'] as const;

/** Leads → surveys → quotations → accepted, with the conversion between steps. */
export function PipelineCard() {
  const t = useTranslations('commandCenter.pipeline');
  const { pipeline } = PREVIEW;
  const max = pipeline.leads;
  return (
    <Card id="pipeline" className="flex flex-col">
      <CardHeader title={t('title')} description={t('description')} />
      <ol className="flex flex-col gap-4 px-5 pb-5">
        {PIPELINE_STEPS.map((step, index) => {
          const value = pipeline[step];
          const previousStep = index > 0 ? PIPELINE_STEPS[index - 1] : undefined;
          const conversion = previousStep
            ? Math.round((value / pipeline[previousStep]) * 100)
            : null;
          return (
            <li key={step} className="flex flex-col gap-1.5">
              <p className="flex items-baseline justify-between gap-3 type-body-sm">
                <span className="text-ink-muted">{t(step)}</span>
                <span className="flex items-baseline gap-2">
                  {conversion !== null && (
                    <span className="font-mono text-[0.75rem] text-ink-faint">{conversion}%</span>
                  )}
                  <span className="type-title-md text-ink tabular-nums">{value}</span>
                </span>
              </p>
              <span className="block h-2.5 overflow-hidden rounded-full bg-sunken">
                <motion.span
                  className={`block h-full origin-left rounded-full ${STEP_FILL[index]}`}
                  style={{ width: `${(value / max) * 100}%` }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{
                    duration: seconds('data'),
                    ease: easing('outExpo'),
                    delay: index * 0.08,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
