'use client';

import { Card, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ruleSummary } from '@/features/team/resellers/rule-summary';
import { useDefaultCommissionRule } from '@/features/team/resellers/use-resellers';
import { useReferralProgram } from '../referrals/use-referral-program';
import { SettingsSection } from '../settings-section';

function Row({
  title,
  status,
  children,
  href,
  open,
}: {
  readonly title: string;
  readonly status?: ReactNode;
  readonly children: ReactNode;
  readonly href: string;
  readonly open: string;
}) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="type-title-md text-ink">{title}</h3>
          {status}
        </div>
        <p className="max-w-xl type-body-sm text-ink-muted">{children}</p>
      </div>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1 self-start whitespace-nowrap type-body-sm text-accent hover:underline sm:pt-0.5"
      >
        {open}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </li>
  );
}

/** Referral rewards in a line, with the switch state. */
function ReferralLine() {
  const t = useTranslations('settings.rewards.other');
  const eventT = useTranslations('team.resellers.rule.events');
  const program = useReferralProgram();
  if (program.isPending) return t('loading');
  if (!program.data) return t('unavailable');
  const { active, basis, amountPaise, qualifyingEvent } = program.data;
  if (!active) return t('referralOffDetail');
  const values = { amount: formatInr(amountPaise), event: eventT(qualifyingEvent) };
  return basis === 'per_kw' ? t('referralPerKw', values) : t('referralPerReferral', values);
}

function CommissionLine() {
  const t = useTranslations('settings.rewards.other');
  const resellerT = useTranslations('team.resellers');
  const rule = useDefaultCommissionRule();
  if (rule.isPending) return t('loading');
  if (!rule.data) return t('unavailable');
  return t('commissionDetail', { rule: ruleSummary(resellerT, rule.data) });
}

/** The rewards that pay money, each summed up in a line with a way to its own settings. */
export function OtherRewards() {
  const t = useTranslations('settings.rewards.other');
  const program = useReferralProgram();
  const active = program.data?.active;
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <Card>
        <ul className="divide-y divide-hairline">
          <Row
            title={t('referrals')}
            href="/settings?tab=referrals"
            open={t('referralsOpen')}
            status={
              active === undefined ? null : (
                <StatusPill
                  size="sm"
                  tone={active ? 'onTrack' : 'neutral'}
                  label={active ? t('on') : t('off')}
                />
              )
            }
          >
            <ReferralLine />
          </Row>
          <Row title={t('commission')} href="/team?tab=resellers" open={t('commissionOpen')}>
            <CommissionLine />
          </Row>
          <Row title={t('bonuses')} href="/settings?tab=approvals" open={t('bonusesOpen')}>
            {t('bonusesDetail')}
          </Row>
        </ul>
      </Card>
    </SettingsSection>
  );
}
