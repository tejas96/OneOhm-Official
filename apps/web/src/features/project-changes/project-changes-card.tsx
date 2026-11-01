'use client';

import type { ProjectChange } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  type PillTone,
  StatusPill,
  useToast,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowRight, Check, ChevronRight, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { ChangeImpactView } from './change-impact-view';
import { useChangeActions, useProjectChanges } from './use-project-changes';
import { WithdrawChangeDialog } from './withdraw-change-dialog';

const signed = (paise: number) => `${paise >= 0 ? '+' : '−'}${formatInr(Math.abs(paise))}`;

/** Where an open change stands, in one word for the pill. */
function stage(change: ProjectChange): { key: string; tone: PillTone } {
  if (change.status === 'raised') return { key: 'toApprove', tone: 'review' };
  if (change.status === 'approved')
    return change.quotation?.status === 'sent'
      ? { key: 'withCustomer', tone: 'waiting' }
      : { key: 'toSend', tone: 'atRisk' };
  if (change.status === 'accepted') return { key: 'accepted', tone: 'done' };
  return { key: change.status, tone: 'neutral' };
}

function Kinds({ change }: { readonly change: ProjectChange }) {
  const t = useTranslations('scopeChanges.kinds');
  return (
    <span className="flex flex-wrap gap-1.5">
      {change.kinds.map((kind) => (
        <Badge key={kind} variant="soft" className="py-0">
          {t(kind)}
        </Badge>
      ))}
    </span>
  );
}

/** The open change: what it asks, its impact, and the next step for the right person. */
function OpenChange({
  change,
  onWithdraw,
}: {
  readonly change: ProjectChange;
  readonly onWithdraw: () => void;
}) {
  const t = useTranslations('scopeChanges.card');
  const format = useFormatter();
  const now = useNow();
  const toast = useToast();
  const canManage = useCan('projects.manage');
  const { approve } = useChangeActions(change.projectId);
  const [approving, setApproving] = useState(false);
  const step = stage(change);
  const doApprove = async () => {
    setApproving(true);
    try {
      const done = await approve(change.id);
      toast({ tone: 'success', title: t('approved', { revision: done.quotation?.revision ?? 0 }) });
    } catch (error) {
      toast({ tone: 'error', title: t('approveFailed'), description: describeError(error) });
    } finally {
      setApproving(false);
    }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-title-md text-ink">{t('number', { number: change.number })}</p>
        <StatusPill size="sm" tone={step.tone} label={t(`stage.${step.key}`)} />
      </div>
      <Kinds change={change} />
      <p className="type-body text-ink-muted">{change.reason}</p>
      <p className="type-body-sm text-ink-faint">
        {t('raisedBy', {
          name: change.raisedBy ?? '—',
          when: format.relativeTime(new Date(change.raisedAt), now),
        })}
      </p>
      <details
        className="group rounded-xl border border-hairline"
        open={change.status === 'raised'}
      >
        <summary className="flex cursor-pointer list-none items-center gap-1 px-4 py-3 type-body-sm text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
          {t('impact', { difference: signed(change.impact.price.differencePaise) })}
        </summary>
        <div className="border-t border-hairline px-4 py-4">
          <ChangeImpactView impact={change.impact} />
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        {canManage && change.status === 'raised' && (
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<Check />}
            pending={approving}
            onClick={doApprove}
          >
            {t('approve')}
          </Button>
        )}
        {change.quotation && (
          <Link
            href={`/quotations/${change.quotation.id}`}
            className="inline-flex min-h-9 items-center gap-1 px-2 type-body-sm text-accent hover:underline"
          >
            {t(change.quotation.status === 'sent' ? 'openSent' : 'openRevision', {
              revision: change.quotation.revision,
            })}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
        {canManage && (
          <Button variant="quiet" size="sm" leadingIcon={<Undo2 />} onClick={onWithdraw}>
            {t('withdraw')}
          </Button>
        )}
      </div>
      <p className="type-body-sm text-ink-faint">{t(`next.${step.key}`)}</p>
    </div>
  );
}

/** Earlier changes, one line each. */
function PastChanges({ changes }: { readonly changes: readonly ProjectChange[] }) {
  const t = useTranslations('scopeChanges.card');
  const format = useFormatter();
  if (changes.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
      {changes.map((change) => {
        const step = stage(change);
        return (
          <li key={change.id} className="flex flex-col gap-1 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="type-body text-ink">{t('number', { number: change.number })}</span>
              <StatusPill size="sm" tone={step.tone} label={t(`stage.${step.key}`)} />
            </div>
            <Kinds change={change} />
            <p className="type-body-sm text-ink-faint">
              {signed(change.impact.price.differencePaise)} ·{' '}
              {format.dateTime(new Date(change.closedAt ?? change.raisedAt), {
                day: 'numeric',
                month: 'short',
              })}
              {change.closeReason ? ` · ${change.closeReason}` : ''}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** Scope changes on the project (PRD 3.6): the open one first, then the history. */
export function ProjectChangesCard({ projectId }: { readonly projectId: string }) {
  const t = useTranslations('scopeChanges.card');
  const changes = useProjectChanges(projectId);
  const [withdrawing, setWithdrawing] = useState<ProjectChange | null>(null);
  if (!changes.data || changes.data.length === 0) return null;
  const open = changes.data.find(
    (change) => change.status === 'raised' || change.status === 'approved',
  );
  const past = changes.data.filter((change) => change !== open);
  return (
    <Card className="flex flex-col">
      <CardHeader title={t('title')} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        {open && <OpenChange change={open} onWithdraw={() => setWithdrawing(open)} />}
        <PastChanges changes={past} />
      </div>
      <WithdrawChangeDialog change={withdrawing} onClose={() => setWithdrawing(null)} />
    </Card>
  );
}
