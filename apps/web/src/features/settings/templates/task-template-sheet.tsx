'use client';

import type { TaskTemplateRecord } from '@oneohm/api-contracts';
import { Button, type SelectOption, Sheet, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { TaskBasicsFields } from './task-basics-fields';
import { TaskConditionsFields } from './task-conditions-fields';
import { BLANK_TASK, type TaskDraft, toDraft, toInput } from './task-draft';
import { TaskNotifyFields } from './task-notify-fields';
import { TEMPLATE_KEYS, useMessageTemplates } from './use-templates';

function Group({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-hairline pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-title-md text-ink">{title}</h3>
        {hint && <p className="type-body-sm text-ink-faint">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Add or edit one task template; `template` null adds a new one. */
export function TaskTemplateSheet({
  open,
  template,
  all,
  roles,
  onClose,
}: {
  readonly open: boolean;
  readonly template: TaskTemplateRecord | null;
  readonly all: readonly TaskTemplateRecord[];
  readonly roles: readonly SelectOption<string>[];
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const settingsT = useTranslations('settings');
  const formId = useId();
  const toast = useToast();
  const client = useQueryClient();
  const messages = useMessageTemplates();
  const form = useApiForm();
  const { reset } = form;
  const [draft, setDraft] = useState<TaskDraft>(BLANK_TASK);

  useEffect(() => {
    if (!open) return;
    setDraft(template ? toDraft(template) : BLANK_TASK);
    reset();
  }, [open, template, reset]);

  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = toInput(draft);
    const saved = await form.run(() => {
      if (!template) return expectStatus(api.templates.createTaskTemplate({ body: input }), 201);
      const { key: _key, ...body } = input;
      return expectStatus(
        api.templates.updateTaskTemplate({ params: { id: template.id }, body }),
        200,
      );
    });
    if (!saved) return;
    await client.invalidateQueries({ queryKey: TEMPLATE_KEYS.tasks });
    await client.invalidateQueries({ queryKey: TEMPLATE_KEYS.messages });
    toast({ title: t(template ? 'updated' : 'created', { title: saved.title }), tone: 'success' });
    onClose();
  };

  const errors = form.fieldErrors;
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={template ? t('editTitle') : t('createTitle')}
      description={template?.title}
      width="lg"
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {template ? settingsT('save') : t('create')}
        </Button>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        <Group title={t('basics')}>
          <TaskBasicsFields
            draft={draft}
            set={set}
            errors={errors}
            isNew={!template}
            others={all.filter((other) => other.key !== draft.key)}
            roles={roles}
          />
        </Group>
        <Group title={t('conditions')} hint={t('conditionsHint')}>
          <TaskConditionsFields draft={draft} set={set} errors={errors} />
        </Group>
        <Group title={t('people')}>
          <TaskNotifyFields
            draft={draft}
            set={set}
            errors={errors}
            messages={messages.data ?? []}
          />
        </Group>
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
