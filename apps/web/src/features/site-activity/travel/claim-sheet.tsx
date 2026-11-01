'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { Button, Sheet, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowDown, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { DecideDialog } from '@/features/team/decide-dialog';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { useSiteFormat } from '../site-format';
import { VisitDistance } from '../visit-distance';
import { ClaimStatus } from './claim-status';
import { useClaimDay, useDecideClaim } from './use-travel';

function Section({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-overline text-ink-faint">{title}</h3>
        {hint && <p className="type-body-sm text-ink-faint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Stable keys for legs, which can repeat (two visits to one site). */
function keyed(legs: TravelClaim['legs']) {
  const seen = new Map<string, number>();
  return legs.map((leg) => {
    const base = `${leg.fromLabel}>${leg.toLabel}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return { leg, key: `${base}#${count}`, first: leg === legs[0] };
  });
}

function Route({ claim }: { readonly claim: TravelClaim }) {
  const t = useTranslations('siteActivity.sheet');
  const format = useSiteFormat();
  return (
    <ol className="flex flex-col gap-1 rounded-lg border border-hairline px-4 py-3">
      {keyed(claim.legs).map(({ leg, key, first }) => (
        <li key={key} className="flex flex-col gap-1">
          {first && <span className="type-body-sm text-ink">{leg.fromLabel}</span>}
          <span className="flex items-center gap-2 pl-1 type-label text-ink-faint">
            <ArrowDown aria-hidden className="size-3.5 shrink-0" />
            {leg.distanceM === null ? t('unpaidLeg') : format.distance(leg.distanceM)}
          </span>
          <span className="type-body-sm text-ink">{leg.toLabel}</span>
        </li>
      ))}
    </ol>
  );
}

function DayVisits({ claimId }: { readonly claimId: string }) {
  const t = useTranslations('siteActivity');
  const format = useSiteFormat();
  const day = useClaimDay(claimId);
  if (day.isPending) return <ListSkeleton label={t('sheet.loading')} rows={2} />;
  if (day.isError) return <LoadError error={day.error} onRetry={() => day.refetch()} />;
  if (day.data.visits.length === 0)
    return <p className="type-body-sm text-ink-faint">{t('sheet.noVisits')}</p>;
  return (
    <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
      {day.data.visits.map((visit) => (
        <li key={visit.id} className="flex flex-col gap-1.5 px-4 py-3">
          <span className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="type-body-sm font-medium text-ink">
              {[visit.projectCode, visit.taskTitle].filter(Boolean).join(' · ')}
            </span>
            <span className="font-mono text-[0.8125rem] text-ink-muted tabular-nums">
              {visit.checkOutAt
                ? t('visits.inOut', {
                    from: format.time(visit.checkInAt),
                    to: format.time(visit.checkOutAt),
                  })
                : t('visits.stillIn', { from: format.time(visit.checkInAt) })}
            </span>
          </span>
          <VisitDistance visit={visit} />
        </li>
      ))}
    </ul>
  );
}

/** A claim in full: the route, the site check-ins behind it, and the decision (PRD 4.3). */
export function ClaimSheet({
  claim,
  onClose,
}: {
  readonly claim: TravelClaim | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('siteActivity');
  const format = useSiteFormat();
  const toast = useToast();
  const me = useCurrentUser();
  const canDecide = useCan('leave.approve');
  const decide = useDecideClaim();
  const [deciding, setDeciding] = useState<boolean | null>(null);
  const own = claim?.user.id === me.id;
  const pending = claim?.status === 'pending';
  const total = claim
    ? t('claims.totalLine', {
        distance: format.distance(claim.distanceM),
        rate: formatInr(claim.ratePaisePerKm),
        amount: formatInr(claim.amountPaise),
      })
    : '';

  return (
    <Sheet
      open={claim !== null}
      onOpenChange={(open) => !open && onClose()}
      title={claim ? t('sheet.title', { day: format.day(claim.workDate) }) : ''}
      description={claim?.user.fullName}
      header={
        claim ? (
          <div className="flex">
            <ClaimStatus claim={claim} />
          </div>
        ) : undefined
      }
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('sheet.close')}
          </Button>
          {claim && pending && canDecide && !own && (
            <>
              <Button leadingIcon={<X />} onClick={() => setDeciding(false)}>
                {t('sheet.decline')}
              </Button>
              <Button variant="primary" leadingIcon={<Check />} onClick={() => setDeciding(true)}>
                {t('sheet.approve')}
              </Button>
            </>
          )}
        </>
      }
    >
      {claim && (
        <div className="flex flex-col gap-7 px-5 py-6 sm:px-6">
          <div className="flex flex-col gap-1">
            <p className="type-title-md text-ink tabular-nums">{total}</p>
            {claim.project ? (
              <Link
                href={`/projects/${claim.project.id}`}
                className="self-start type-body-sm text-accent hover:underline"
              >
                {t('sheet.project', { code: claim.project.code })}
              </Link>
            ) : (
              <p className="type-body-sm text-ink-faint">{t('sheet.noProject')}</p>
            )}
          </div>
          {claim.note && <p className="type-body-sm text-ink-muted">“{claim.note}”</p>}
          {pending && own && <p className="type-body-sm text-ink-faint">{t('sheet.ownClaim')}</p>}
          <Section title={t('sheet.legs')} hint={t('sheet.legsHint')}>
            <Route claim={claim} />
          </Section>
          <Section title={t('sheet.visits')}>
            <DayVisits claimId={claim.id} />
          </Section>
          {claim.decidedBy && (
            <div className="flex flex-col gap-1 type-body-sm text-ink-muted">
              <p>{t('sheet.decided', { name: claim.decidedBy.fullName })}</p>
              {claim.decisionNote && <p>{t('sheet.decisionNote', { note: claim.decisionNote })}</p>}
              {claim.paidOn && <p>{t('sheet.paidOn', { date: format.day(claim.paidOn) })}</p>}
              {claim.payableId && (
                <Link
                  href="/finance?tab=payables"
                  className="self-start text-accent hover:underline"
                >
                  {t('sheet.payable')}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
      <DecideDialog
        target={
          claim && deciding !== null
            ? {
                approve: deciding,
                title: t('claims.dialogTitle', {
                  name: claim.user.fullName,
                  day: format.day(claim.workDate),
                }),
                summary: (
                  <div className="flex flex-col gap-2">
                    <p className="type-body text-ink">{total}</p>
                    <p className="type-body-sm text-ink-muted">
                      {t('claims.approveNote', { amount: formatInr(claim.amountPaise) })}
                    </p>
                  </div>
                ),
              }
            : null
        }
        onClose={() => setDeciding(null)}
        onDecide={async (approve, note) => {
          if (!claim) return;
          const decided = await decide(claim.id, approve, note);
          toast({
            title: approve ? t('claims.approved') : t('claims.declined'),
            description: approve ? t('claims.approvedBody') : undefined,
            reference: decided.user.fullName,
            tone: 'success',
          });
          onClose();
        }}
      />
    </Sheet>
  );
}
