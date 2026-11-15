'use client';

import type { MarketingOverview } from '@oneohm/api-contracts';
import { Badge, listItemEnter } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Gift, QrCode } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { CountValue } from './count-value';

function SideCard({
  index,
  icon,
  title,
  onOpen,
  children,
}: {
  readonly index: number;
  readonly icon: ReactNode;
  readonly title: string;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}) {
  return (
    <motion.li
      layout
      {...listItemEnter(index)}
      className="relative flex flex-col gap-3 rounded-xl border border-hairline bg-raised p-4 transition-[box-shadow,border-color,transform] duration-(--duration-base) ease-standard hover:-translate-y-0.5 hover:border-rule hover:shadow-e2"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-accent-soft text-accent [&_svg]:size-5">
          {icon}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="oh-stretched-link text-left type-title-md text-ink outline-offset-4"
        >
          {title}
        </button>
      </div>
      {children}
    </motion.li>
  );
}

/** Refer and earn: on or off, and what it brought. Opens the programme settings. */
export function ReferralCard({
  referral,
  index,
  onOpen,
}: {
  readonly referral: NonNullable<MarketingOverview['referral']>;
  readonly index: number;
  readonly onOpen: () => void;
}) {
  const t = useTranslations('marketing');
  return (
    <SideCard index={index} icon={<Gift aria-hidden />} title={t('referral.title')} onOpen={onOpen}>
      <div className="flex items-center gap-2">
        <Badge variant={referral.active ? 'energy' : 'soft'}>
          {t(referral.active ? 'referral.on' : 'referral.off')}
        </Badge>
        <span className="type-body-sm text-ink-muted">{t('referral.line')}</span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        <Stat label={t('numbers.leads')} value={referral.leads} />
        <Stat label={t('numbers.sales')} value={referral.sales} />
        <div className="min-w-0">
          <dt className="truncate type-body-sm text-ink-faint">{t('referral.rewards')}</dt>
          <dd className="truncate type-title-md text-ink tabular-nums">
            {formatInr(referral.rewardsPaise)}
          </dd>
        </div>
      </dl>
    </SideCard>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate type-body-sm text-ink-faint">{label}</dt>
      <dd className="truncate type-title-md text-ink tabular-nums">
        <CountValue value={value > 0 ? value : null} />
      </dd>
    </div>
  );
}

/** Poster codes made by hand, with what each brought. Opens the code list. */
export function CodesCard({
  codes,
  index,
  onOpen,
}: {
  readonly codes: MarketingOverview['codes'];
  readonly index: number;
  readonly onOpen: () => void;
}) {
  const t = useTranslations('marketing');
  return (
    <SideCard index={index} icon={<QrCode aria-hidden />} title={t('codes.title')} onOpen={onOpen}>
      {codes.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('codes.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-hairline">
          {codes.slice(0, 4).map((code) => (
            <li key={code.code} className="flex items-center justify-between gap-3 py-1.5">
              <span className="min-w-0 truncate type-body text-ink">
                <span className="font-medium">{code.code}</span>
                <span className="text-ink-faint"> · {code.name}</span>
              </span>
              <span className="shrink-0 type-body-sm text-ink-muted tabular-nums">
                {t('codes.counts', { leads: code.leads, sales: code.sales })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="type-body-sm text-ink-faint">{t('codes.hint')}</p>
    </SideCard>
  );
}
