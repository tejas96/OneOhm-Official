'use client';

import type { CustomerFeedback, CustomerReferral } from '@oneohm/api-contracts';
import { Card, CardHeader, cn, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { Star } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

const STAGE_TONE: Readonly<Record<CustomerReferral['stage'], PillTone>> = {
  new: 'neutral',
  contacted: 'review',
  survey_scheduled: 'review',
  quoted: 'waiting',
  won: 'done',
  lost: 'blocked',
};

function Stars({ rating }: { readonly rating: number }) {
  const t = useTranslations('customers.service');
  return (
    <span role="img" aria-label={t('stars', { rating })} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          aria-hidden
          className={cn(
            'size-3.5',
            value <= rating ? 'fill-energy text-energy' : 'fill-transparent text-hairline',
          )}
        />
      ))}
    </span>
  );
}

const Empty = ({ text }: { readonly text: string }) => (
  <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">{text}</p>
);

/** Ratings and comments after handover, with the average on top. */
export function CustomerFeedbackCard({
  feedback,
}: {
  readonly feedback: readonly CustomerFeedback[];
}) {
  const t = useTranslations('customers.service');
  const format = useFormatter();
  const average = feedback.length
    ? feedback.reduce((sum, entry) => sum + entry.rating, 0) / feedback.length
    : 0;
  return (
    <Card className="min-w-0">
      <CardHeader
        title={t('feedbackTitle')}
        description={
          feedback.length > 0
            ? t('average', {
                average: format.number(average, { maximumFractionDigits: 1 }),
                count: feedback.length,
              })
            : undefined
        }
      />
      {feedback.length === 0 ? (
        <Empty text={t('feedbackNone')} />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {feedback.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <Stars rating={entry.rating} />
                <span className="type-label text-ink-faint">
                  <span className="font-mono">{entry.project.code}</span> ·{' '}
                  {format.dateTime(new Date(entry.createdAt), { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <p className={cn('type-body-sm', entry.comment ? 'text-ink' : 'text-ink-faint')}>
                {entry.comment ?? t('noComment')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** People the customer referred, and how far each lead got. */
export function CustomerReferralsCard({
  referrals,
}: {
  readonly referrals: readonly CustomerReferral[];
}) {
  const t = useTranslations('customers.service');
  const format = useFormatter();
  return (
    <Card className="min-w-0">
      <CardHeader title={t('referralsTitle')} description={t('referralsBody')} />
      {referrals.length === 0 ? (
        <Empty text={t('referralsNone')} />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {referrals.map((lead) => (
            <li
              key={lead.id}
              className="relative flex items-start justify-between gap-3 px-5 py-3 transition-colors hover:bg-sunken/50"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <Link
                  href={`/leads/${lead.id}`}
                  className="oh-stretched-link truncate type-body-sm font-medium text-ink hover:text-accent"
                >
                  {lead.name}
                </Link>
                <span className="type-label text-ink-faint">
                  {lead.city} ·{' '}
                  {format.dateTime(new Date(lead.createdAt), { day: 'numeric', month: 'short' })}
                  {lead.customerId && ` · ${t('becameCustomer')}`}
                </span>
              </div>
              <StatusPill
                tone={STAGE_TONE[lead.stage]}
                label={t(`stages.${lead.stage}`)}
                size="sm"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
