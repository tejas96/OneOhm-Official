'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Checkbox, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import type { TaskRights } from '../tasks/task-menu';
import { useInvalidateWork } from '../tasks/use-task-actions';
import { PanelSection } from './task-panel-sections';

/**
 * The task's checklist. Whoever works the task ticks items here and each tick is saved at
 * once, so nothing waits for "Complete" and a tick counts as an update (spec 3.5).
 * Others, and closed tasks, see it read-only.
 */
export function PanelChecklist({
  task,
  rights,
}: {
  readonly task: ProjectTask;
  readonly rights: TaskRights;
}) {
  const t = useTranslations('projects.panel');
  const toast = useToast();
  const invalidate = useInvalidateWork();
  // What the person just ticked, shown while it saves; the server's answer replaces it.
  const [saving, setSaving] = useState<ReadonlyMap<string, boolean>>(new Map());
  const save = useMutation({
    mutationFn: (input: { key: string; done: boolean }) =>
      expectStatus(api.tasks.tickChecklist({ params: { id: task.id }, body: input }), 200),
    onSettled: async (_data, _error, input) => {
      await invalidate();
      setSaving((current) => {
        const next = new Map(current);
        next.delete(input.key);
        return next;
      });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('tickFailed'), description: describeError(error) }),
  });
  if (task.checklist.length === 0) return null;
  const open = task.status !== 'completed' && task.status !== 'in_review';
  const canTick = open && rights.work;
  const shown = (item: ProjectTask['checklist'][number]) => saving.get(item.key) ?? item.done;
  const done = task.checklist.filter(shown).length;

  return (
    <PanelSection title={t('checklist', { done, total: task.checklist.length })}>
      <ul className="flex flex-col">
        {task.checklist.map((item) => (
          <li key={item.key}>
            <Checkbox
              checked={shown(item)}
              disabled={!canTick || saving.has(item.key)}
              strikeWhenChecked
              label={item.label}
              onCheckedChange={(checked) => {
                setSaving((current) => new Map(current).set(item.key, checked));
                save.mutate({ key: item.key, done: checked });
              }}
            />
          </li>
        ))}
      </ul>
      {open && !rights.work && <p className="type-body-sm text-ink-faint">{t('tickOthers')}</p>}
    </PanelSection>
  );
}
