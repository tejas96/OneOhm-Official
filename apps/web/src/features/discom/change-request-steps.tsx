'use client';

import type { ChangeRequestDetail, ChangeRequestStepView } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  CardHeader,
  cn,
  StatusGlyph,
  type StatusGlyphName,
  useToast,
} from '@oneohm/design-system/web';
import { Check, Hourglass, Play } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { CompleteStepDialog, WaitStepDialog } from './step-dialogs';
import { useRefreshDiscom } from './use-discom';

const GLYPH: Readonly<Record<ChangeRequestStepView['status'], StatusGlyphName>> = {
  pending: 'notStarted',
  ready: 'ready',
  in_progress: 'progress',
  waiting: 'waiting',
  completed: 'done',
};

/** The request's DISCOM steps in order; each is started, waited on and completed. */
export function ChangeRequestSteps({ request }: { readonly request: ChangeRequestDetail }) {
  const t = useTranslations('discom.request');
  const [dialog, setDialog] = useState<{
    kind: 'wait' | 'complete';
    step: ChangeRequestStepView;
  } | null>(null);
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={t('steps')}
        description={t('stepsDone', { done: request.stepsDone, total: request.stepsTotal })}
      />
      <ol className="flex flex-col border-t border-hairline">
        {request.steps.map((step, index) => (
          <StepRow
            key={step.id}
            request={request}
            step={step}
            last={index === request.steps.length - 1}
            onWait={() => setDialog({ kind: 'wait', step })}
            onComplete={() => setDialog({ kind: 'complete', step })}
          />
        ))}
      </ol>
      {dialog?.kind === 'wait' && (
        <WaitStepDialog request={request} step={dialog.step} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'complete' && (
        <CompleteStepDialog request={request} step={dialog.step} onClose={() => setDialog(null)} />
      )}
    </Card>
  );
}

function StepRow({
  request,
  step,
  last,
  onWait,
  onComplete,
}: {
  readonly request: ChangeRequestDetail;
  readonly step: ChangeRequestStepView;
  readonly last: boolean;
  readonly onWait: () => void;
  readonly onComplete: () => void;
}) {
  const t = useTranslations('discom.request');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const toast = useToast();
  const refresh = useRefreshDiscom();
  const user = useCurrentUser();
  const canManage = useCan('discom.manage');
  const [starting, setStarting] = useState(false);
  const mine = step.assignee?.id === user.id || canManage;
  const actionable =
    request.status === 'open' && mine && step.status !== 'completed' && step.status !== 'pending';

  const start = async () => {
    setStarting(true);
    try {
      await expectStatus(
        api.discom.startChangeRequestStep({ params: { id: request.id, stepId: step.id } }),
        200,
      );
      await refresh();
    } catch (error) {
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
    } finally {
      setStarting(false);
    }
  };

  const date = (value: string) =>
    format.dateTime(new Date(value), { day: 'numeric', month: 'short' });
  return (
    <li
      className={cn(
        'flex gap-4 px-5 py-4',
        !last && 'border-b border-hairline',
        step.status === 'pending' && 'opacity-60',
      )}
    >
      <StatusGlyph name={GLYPH[step.status]} className="mt-0.5 size-5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="type-title-md text-ink">{step.title}</p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 type-body-sm text-ink-muted">
          <span>{step.assignee?.fullName ?? t('unassigned')}</span>
          {step.completedAt ? (
            <span>{t('doneOn', { date: date(step.completedAt) })}</span>
          ) : (
            <span className={step.overdue ? 'text-overdue' : undefined}>
              {t('dueOn', { date: date(step.dueDate) })}
            </span>
          )}
          {step.status === 'waiting' && (
            <span className="text-waiting">
              {t('waitingOn', { party: partyT(step.waitingParty) })}
            </span>
          )}
          {step.nextFollowUpOn && step.status !== 'completed' && (
            <span>{t('followUpOn', { date: date(step.nextFollowUpOn) })}</span>
          )}
        </p>
        {step.note && <p className="type-body-sm text-ink-faint">{step.note}</p>}
        {actionable && (
          <div className="mt-1 flex flex-wrap gap-2">
            {step.status === 'ready' && (
              <Button
                size="sm"
                variant="secondary"
                leadingIcon={<Play />}
                pending={starting}
                onClick={start}
              >
                {t('start')}
              </Button>
            )}
            <Button size="sm" variant="quiet" leadingIcon={<Hourglass />} onClick={onWait}>
              {t('wait')}
            </Button>
            <Button size="sm" variant="primary" leadingIcon={<Check />} onClick={onComplete}>
              {last ? t('completeLast') : t('complete')}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}
