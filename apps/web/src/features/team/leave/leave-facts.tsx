'use client';

import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import { Badge, StatusPill } from '@oneohm/design-system/web';
import { UserRoundCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DECISION_TONE, daysOf, useWorkforceFormat } from '../workforce-format';

type LeaveWindowFields = Pick<LeaveRequestRecord, 'fromDate' | 'toDate' | 'halfDay' | 'halfDays'>;

/** "5 days" or "Half a day", and "2–6 Nov · 5 days". */
export function useLeaveText() {
  const t = useTranslations('team.leave');
  const format = useWorkforceFormat();
  const length = (leave: LeaveWindowFields) =>
    leave.halfDay ? t('halfDay') : t('days', { count: daysOf(leave.halfDays) });
  return {
    length,
    when: (leave: LeaveWindowFields) =>
      `${format.range(leave.fromDate, leave.toDate)} · ${length(leave)}`,
  };
}

export function LeaveStatus({ leave }: { readonly leave: LeaveRequestRecord }) {
  const t = useTranslations('team.leave.status');
  return <StatusPill size="sm" tone={DECISION_TONE[leave.status]} label={t(leave.status)} />;
}

/** The kind of leave, flagged when it was an emergency. */
export function LeaveKind({ leave }: { readonly leave: LeaveRequestRecord }) {
  const t = useTranslations('team.leave');
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5 md:justify-start">
      <span className="type-body-sm text-ink">{leave.leaveLabel}</span>
      {leave.emergency && <Badge variant="outline">{t('emergency')}</Badge>}
    </span>
  );
}

const COVER_TONE = { asked: 'review', accepted: 'onTrack', declined: 'overdue' } as const;

/** Whether the backup said yes, with their note. */
function CoverAnswerLine({ leave }: { readonly leave: LeaveRequestRecord }) {
  const t = useTranslations('team.leave.cover.answer');
  if (!leave.backup || !leave.coverAnswer) return null;
  const name = leave.backup.fullName;
  return (
    <div className="flex flex-col gap-1 pl-6">
      <StatusPill
        size="sm"
        tone={COVER_TONE[leave.coverAnswer]}
        label={t(leave.coverAnswer, { name })}
      />
      {leave.coverNote && <p className="type-body-sm text-ink-muted">“{leave.coverNote}”</p>}
    </div>
  );
}

/** Who covers, what they were told, and how much work moved to them. */
export function LeaveCover({ leave }: { readonly leave: LeaveRequestRecord }) {
  const t = useTranslations('team.leave');
  if (leave.handoverSkipped) return <NoHandoverBadge />;
  if (!leave.backup) return <p className="type-body-sm text-ink-faint">{t('noBackup')}</p>;
  return (
    <div className="flex flex-col gap-1 rounded-md bg-sunken/70 px-3 py-2.5">
      <p className="flex items-center gap-2 type-body-sm text-ink">
        <UserRoundCheck aria-hidden className="size-4 shrink-0 text-ink-faint" />
        <span>
          {t(
            leave.coverAnswer === 'accepted' || !leave.coverAnswer ? 'coveredBy' : 'askedToCover',
            {
              name: leave.backup.fullName,
            },
          )}
          {leave.status === 'approved' && (
            <span className="text-ink-faint">
              {' · '}
              {t('handedOver', { count: leave.tasksHandedOver })}
            </span>
          )}
        </span>
      </p>
      {leave.handoverNote && (
        <p className="pl-6 type-body-sm text-ink-muted">“{leave.handoverNote}”</p>
      )}
      <CoverAnswerLine leave={leave} />
    </div>
  );
}

/** Emergency leave approved with work open and nobody covering it. */
export function NoHandoverBadge() {
  const t = useTranslations('team.leave');
  return <Badge variant="energy">{t('noHandoverEmergency')}</Badge>;
}

/** The approver's answer, when there is one. */
export function LeaveDecision({ leave }: { readonly leave: LeaveRequestRecord }) {
  const t = useTranslations('team.leave');
  if (!leave.decidedBy) return null;
  return (
    <p className="type-body-sm text-ink-muted">
      {t('decidedBy', { name: leave.decidedBy.fullName })}
      {leave.decisionNote && <span className="text-ink"> “{leave.decisionNote}”</span>}
    </p>
  );
}
