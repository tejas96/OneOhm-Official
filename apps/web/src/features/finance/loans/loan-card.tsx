'use client';

import type { ProjectLoan } from '@oneohm/api-contracts';
import { Button, Card, cn, type PillTone, StatusPill } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { BellRing, Circle, CircleCheck, PencilLine, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { SendToCustomerButton } from '@/features/send-to-customer/send-to-customer-button';

const TONE: Readonly<Record<ProjectLoan['status'], PillTone>> = {
  collecting_documents: 'review',
  submitted: 'waiting',
  sanctioned: 'onTrack',
  disbursing: 'onTrack',
  disbursed: 'done',
  rejected: 'blocked',
};

/** One loan at a glance: the bank's share and how much of it has arrived. */
export function LoanCard({
  loan,
  onEdit,
  onReceive,
}: {
  readonly loan: ProjectLoan;
  readonly onEdit?: () => void;
  readonly onReceive?: () => void;
}) {
  const t = useTranslations('finance.loans');
  const format = useFormatter();
  const share = Math.max(1, loan.bankSharePaise);
  const received = Math.min(100, (loan.receivedPaise / share) * 100);
  const documentsIn = loan.documents.filter((document) => document.received).length;
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const owed = loan.receivedPaise < loan.bankSharePaise;
  // The lender's papers still to come, each asked with one tap (redesign §18 11).
  const asked = useTranslations('sendToCustomer.quickPapers');
  const missing =
    loan.documents.length === 0
      ? [{ category: 'bank_loan' as const, title: asked('loanFallback'), requirementKey: 'loan' }]
      : loan.documents
          .filter((document) => !document.received)
          .map((document) => ({ category: 'bank_loan' as const, title: document.name }));

  return (
    <Card className="flex h-full flex-col gap-5 rounded-[28px] p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono text-[0.75rem] text-ink-faint">{loan.projectCode}</p>
          <Link
            href={`/projects/${loan.projectId}?tab=payments`}
            className="truncate type-title-lg text-ink [font-family:var(--font-display)] hover:text-accent"
          >
            {loan.customerName}
          </Link>
          <p className="type-body-sm text-ink-muted">
            {loan.lenderName || t('noLender')}
            {loan.applicationNumber && ` · ${loan.applicationNumber}`}
          </p>
        </div>
        <StatusPill tone={TONE[loan.status]} label={t(`status.${loan.status}`)} size="sm" />
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="type-display-md text-ink tabular-nums">
            {formatInr(loan.receivedPaise)}
          </span>
          <span className="type-body-sm text-ink-faint">
            {t('ofShare', { share: formatInr(loan.bankSharePaise) })}
          </span>
        </div>
        <span className="h-2 overflow-hidden rounded-full bg-sunken">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${received}%` }} />
        </span>
        <p className="type-body-sm text-ink-muted">
          {loan.sanctionedPaise
            ? loan.sanctionedOn
              ? t('sanctioned', {
                  amount: formatInr(loan.sanctionedPaise),
                  date: date(loan.sanctionedOn),
                })
              : t('sanctionedUndated', { amount: formatInr(loan.sanctionedPaise) })
            : t('notSanctioned')}
        </p>
        {loan.sanctionedPaise !== null && loan.sanctionedPaise !== loan.bankSharePaise && (
          <p className="rounded-md bg-at-risk-tint px-3 py-2 type-body-sm text-at-risk">
            {t('mismatch', {
              sanction: formatInr(loan.sanctionedPaise),
              share: formatInr(loan.bankSharePaise),
            })}
          </p>
        )}
      </div>

      {loan.readyToClaim && (
        <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 type-body-sm text-ink">
          <BellRing aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          {t('readyToClaim')}
        </p>
      )}

      {loan.documents.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="type-overline text-ink-faint uppercase">
            {t('documents', { done: documentsIn, total: loan.documents.length })}
          </p>
          <ul className="flex flex-wrap gap-2">
            {loan.documents.map((document) => (
              <li
                key={document.name}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 type-label',
                  document.received ? 'bg-done-tint text-done' : 'bg-sunken text-ink-muted',
                )}
              >
                {document.received ? (
                  <CircleCheck aria-hidden className="size-3.5" />
                ) : (
                  <Circle aria-hidden className="size-3.5" />
                )}
                {document.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loan.tranches.length > 0 && (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg ring-1 ring-hairline">
          {loan.tranches.map((tranche) => (
            <li
              key={tranche.id}
              className="flex items-center justify-between gap-3 px-3 py-2 type-body-sm"
            >
              <span className="text-ink">{tranche.label}</span>
              <span className="flex items-center gap-3">
                <span className="font-mono text-ink tabular-nums">
                  {formatInr(tranche.amountPaise)}
                </span>
                <span className="w-20 text-right text-ink-faint">
                  {t(`tranche.${tranche.status}`)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {(onEdit || onReceive) && (
        <footer className="mt-auto flex flex-wrap justify-end gap-2">
          {onEdit && loan.started && (
            <SendToCustomerButton
              variant="quiet"
              scope={{ projectId: loan.projectId }}
              quickPapers={missing}
            />
          )}
          {onEdit && (
            <Button variant="quiet" leadingIcon={<PencilLine />} onClick={onEdit}>
              {loan.started ? t('edit') : t('start')}
            </Button>
          )}
          {onReceive && loan.bankMilestoneId && owed && (
            <Button
              variant={loan.readyToClaim ? 'primary' : 'secondary'}
              leadingIcon={<Wallet />}
              onClick={onReceive}
            >
              {t('receive')}
            </Button>
          )}
        </footer>
      )}
    </Card>
  );
}
