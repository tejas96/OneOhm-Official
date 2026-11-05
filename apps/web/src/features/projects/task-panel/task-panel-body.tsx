'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Avatar, Button, cn, StatusPill } from '@oneohm/design-system/web';
import { CalendarClock, Layers, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { EvidenceUploader } from '@/features/documents/evidence-uploader';
import { SelfSurveyCard } from '@/features/self-survey/survey-card';
import { SendToCustomerButton } from '@/features/send-to-customer/send-to-customer-button';
import { TaskVisitLine } from '@/features/site-activity/task-visit-line';
import { VisitCard } from '@/features/visits/visit-card';
import { useCan } from '@/providers/current-user';
import { StaleBadge } from '../tasks/stale-badge';
import { TaskStepButtons } from '../tasks/task-actions';
import { swatchFor } from '../tasks/task-card';
import { TaskCardNotes } from '../tasks/task-card-notes';
import { taskStatusKey, taskTone } from '../tasks/task-status';
import { useTaskSteps } from '../tasks/use-task-steps';
import { PanelChecklist } from './panel-checklist';
import { PriorityControl } from './priority-control';
import { BlockersSection, FactsSection, PanelSection } from './task-panel-sections';
import { hrefWithTask } from './task-panel-url';
import { TaskTimeline } from './task-timeline';

/**
 * Everything about one task, in the order people need it: what and who, what to do
 * next, what holds it, what it holds up, what it needs, and what happened so far.
 */
export function TaskPanelBody({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projects.panel');
  const taskT = useTranslations('projects.task');
  const partyT = useTranslations('commandCenter.party');
  const stagesT = useTranslations('stages');
  const sendT = useTranslations('sendToCustomer');
  const format = useFormatter();
  const canOpenProject = useCan('projects.view_all');
  const steps = useTaskSteps(task);
  const update = steps.menu.find((step) => step.key === 'update');
  const done = task.status === 'completed';
  const day = (date: string) =>
    format.dateTime(new Date(date), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="flex flex-col gap-6 px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 type-body-sm text-ink-muted">
          <PriorityControl task={task} />
          <StatusPill
            tone={taskTone(task)}
            label={
              task.status === 'waiting'
                ? taskT('waitingOn', { party: partyT(task.waitingParty) })
                : taskT(`status.${taskStatusKey(task)}`)
            }
            size="sm"
          />
          {task.assignee ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar
                name={task.assignee.fullName}
                swatch={swatchFor(task.assignee.fullName)}
                size="sm"
                className="size-5 text-[0.5625rem]"
              />
              {task.assignee.fullName}
            </span>
          ) : (
            <span className="text-at-risk">{taskT('unassigned')}</span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              task.overdue && !done && 'font-medium text-overdue',
            )}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            {done && task.completedAt
              ? taskT('doneOn', { date: day(task.completedAt) })
              : taskT(task.overdue ? 'overdueOn' : 'dueOn', { date: day(task.dueDate) })}
          </span>
          <StaleBadge task={task} />
          <span className="inline-flex items-center gap-1.5">
            <Layers aria-hidden className="size-3.5" />
            {stagesT(task.stage)}
          </span>
          {task.approval && (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-3.5" />
              {(task.approverNames ?? []).length > 0
                ? t('approvedBy', {
                    names: (task.approverNames ?? []).slice(0, 3).join(', '),
                    more: Math.max(0, (task.approverNames ?? []).length - 3),
                  })
                : taskT('needsApproval')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canOpenProject ? (
            <Link
              href={hrefWithTask(`/projects/${task.projectId}?tab=tasks`, task.id)}
              className="type-body-sm text-accent hover:underline"
            >
              {t('openProject')}
            </Link>
          ) : (
            <span />
          )}
          <span className="flex flex-wrap items-center gap-2">
            <SendToCustomerButton
              variant="quiet"
              scope={{ taskId: task.id, projectId: task.projectId }}
              {...(task.templateKey.startsWith('subsidy_')
                ? {
                    quickPapers: [
                      {
                        category: 'subsidy',
                        title: sendT('quickPapers.passbook'),
                        requirementKey: 'subsidy_bank',
                      },
                    ],
                  }
                : {})}
            />
            <TaskStepButtons steps={steps} />
          </span>
        </div>
      </div>

      {task.description && (
        <PanelSection title={t('about')}>
          <p className="type-body whitespace-pre-line text-ink">{task.description}</p>
        </PanelSection>
      )}
      <TaskCardNotes task={task} />
      <BlockersSection task={task} />
      <PanelChecklist task={task} rights={steps.rights} />
      <FactsSection task={task} />
      <EvidenceUploader task={task} />
      <TaskVisitLine task={task} />
      <VisitCard scope={{ taskId: task.id }} />
      <SelfSurveyCard task={task} steps={steps} />
      <PanelSection
        title={t('timeline')}
        action={
          update ? (
            <Button size="sm" variant="quiet" onClick={() => steps.run(update)}>
              {t('postUpdate')}
            </Button>
          ) : null
        }
      >
        <TaskTimeline taskId={task.id} />
      </PanelSection>
      {steps.dialogs}
    </div>
  );
}
