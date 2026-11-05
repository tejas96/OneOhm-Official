'use client';

import type { ProjectTask, SelfSurveyView } from '@oneohm/api-contracts';
import { Button, Checkbox, Dialog, StatusPill } from '@oneohm/design-system/web';
import { SURVEY_ITEMS } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { CalendarCheck, Check, RotateCcw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import type { useTaskSteps } from '@/features/projects/tasks/use-task-steps';
import { useCan } from '@/providers/current-user';
import { useSelfSurvey, useSurveyChoices } from './use-self-survey';

/**
 * The self site survey on the survey step (redesign §7): what the customer sent and the three choices.
 * Approve opens the step's own completion form (the field survey's fields), so the re-pricing flow is the same.
 */
export function SelfSurveyCard({
  task,
  steps,
}: {
  readonly task: ProjectTask;
  readonly steps: ReturnType<typeof useTaskSteps>;
}) {
  const allowed = useCan('projects.manage', 'tasks.assign');
  const query = useSelfSurvey(task.id, allowed);
  if (!allowed || !query.data || query.data.status === 'cancelled') return null;
  return <SurveyBody task={task} survey={query.data} steps={steps} />;
}

function SurveyBody({
  task,
  survey,
  steps,
}: {
  readonly task: ProjectTask;
  readonly survey: SelfSurveyView;
  readonly steps: ReturnType<typeof useTaskSteps>;
}) {
  const t = useTranslations('selfSurvey');
  const format = useFormatter();
  const choices = useSurveyChoices(task.id);
  const [asking, setAsking] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const complete = [steps.primary, ...steps.menu].find((one) => one?.key === 'complete');
  const credit =
    survey.creditPaise === null
      ? t('creditNone')
      : t('creditDone', { amount: formatInr(survey.creditPaise) });
  return (
    <section className="flex flex-col gap-3 border-t border-hairline pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-overline text-ink-faint uppercase">{t('title')}</h3>
        <StatusPill
          size="sm"
          tone={
            survey.status === 'received'
              ? 'review'
              : survey.status === 'closed'
                ? 'done'
                : 'waiting'
          }
          label={
            survey.status === 'received'
              ? t('received')
              : survey.status === 'closed'
                ? t('closed', { credit })
                : t('withCustomer')
          }
        />
      </div>
      {survey.status === 'open' && survey.startedAt && (
        <p className="type-body-sm text-ink-muted">
          {t('started', {
            date: format.dateTime(new Date(survey.startedAt), { day: 'numeric', month: 'short' }),
          })}
        </p>
      )}
      {survey.missing.length > 0 && survey.status !== 'closed' && (
        <p className="type-body-sm text-ink-muted">
          {t('missing', { items: survey.missing.map((item) => t(`items.${item}`)).join(', ') })}
        </p>
      )}
      {survey.answers.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 type-body-sm">
          {survey.answers.map((answer) => (
            <div key={answer.item} className="contents">
              <dt className="text-ink-muted">{answer.label}</dt>
              <dd className="text-ink">{answer.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {survey.photos.length > 0 && <p className="type-body-sm text-ink-muted">{t('photos')}</p>}
      {survey.canCheck && (
        <>
          <p className="type-body-sm text-ink-muted">{t('receivedHint')}</p>
          <div className="flex flex-wrap gap-2">
            {complete && (
              <Button leadingIcon={<Check />} onClick={() => steps.run(complete)}>
                {t('approve')}
              </Button>
            )}
            <Button variant="secondary" leadingIcon={<RotateCcw />} onClick={() => setAsking(true)}>
              {t('askAgain')}
            </Button>
            <Button
              variant="quiet"
              leadingIcon={<CalendarCheck />}
              pending={choices.visit.isPending}
              onClick={() => choices.visit.mutate(survey.id)}
            >
              {t('visit')}
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={t('askAgainTitle')}
        description={t('askAgainHint')}
        footer={
          <Button
            disabled={picked.length === 0}
            pending={choices.askAgain.isPending}
            onClick={() =>
              choices.askAgain.mutate(
                { id: survey.id, items: picked as SelfSurveyView['askAgain'] },
                { onSuccess: () => setAsking(false) },
              )
            }
          >
            {t('askAgainSend')}
          </Button>
        }
      >
        <div className="flex flex-col pb-2">
          {SURVEY_ITEMS.map((item) => (
            <Checkbox
              key={item}
              checked={picked.includes(item)}
              onCheckedChange={(on) =>
                setPicked((now) => (on ? [...now, item] : now.filter((one) => one !== item)))
              }
              label={t(`items.${item}`)}
            />
          ))}
        </div>
      </Dialog>
    </section>
  );
}
