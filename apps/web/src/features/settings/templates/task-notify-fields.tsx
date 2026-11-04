'use client';

import type { MessageTemplate } from '@oneohm/api-contracts';
import { Field, Input, Select, Switch } from '@oneohm/design-system/web';
import {
  COMPLETION_ACTIONS,
  renderTemplate,
  TASK_NOTIFY_EVENTS,
  TASK_REVIEWERS,
} from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import type { SetDraft, TaskDraft } from './task-draft';
import { taskMessageChoices } from './task-message-choices';
import { TaskMessageReach } from './task-message-reach';
import { SAMPLE } from './use-templates';

const NONE = 'none';

/** Approval, what finishing sets off, and who hears about it (PRD 3.7, 6.2). */
export function TaskNotifyFields({
  draft,
  set,
  errors,
  messages,
}: {
  readonly draft: TaskDraft;
  readonly set: SetDraft;
  readonly errors: Readonly<Record<string, string>>;
  readonly messages: readonly MessageTemplate[];
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const nameT = useTranslations('settings.messageTemplates.names');
  const choices = taskMessageChoices(messages, draft.messageKey);
  const chosen = messages.find((message) => message.key === draft.messageKey);
  const preview = chosen
    ? renderTemplate(chosen.preview, chosen.fields, {
        ...SAMPLE,
        milestone: draft.customerTitle?.trim() || draft.title || SAMPLE.milestone,
      })
    : '';
  return (
    <div className="flex flex-col gap-5">
      <Switch
        checked={draft.approval}
        onCheckedChange={(value) => set('approval', value)}
        label={t('approval')}
      />
      {draft.approval && (
        <Field label={t('reviewer')} hint={t('reviewerHint')} error={errors.reviewer}>
          <Select
            value={draft.reviewer}
            onValueChange={(value) => set('reviewer', value)}
            options={TASK_REVIEWERS.map((value) => ({ value, label: t(`reviewers.${value}`) }))}
          />
        </Field>
      )}
      <Field label={t('onComplete')} error={errors.onComplete}>
        <Select
          value={draft.onComplete ?? NONE}
          onValueChange={(value) =>
            set('onComplete', value === NONE ? null : (value as TaskDraft['onComplete']))
          }
          options={[
            { value: NONE, label: t('onCompleteNone') },
            ...COMPLETION_ACTIONS.map((value) => ({
              value,
              label: t(`onCompleteOptions.${value}`),
            })),
          ]}
        />
      </Field>
      <Switch
        checked={draft.customerVisible}
        onCheckedChange={(value) => set('customerVisible', value)}
        label={t('customerVisible')}
      />
      <Switch
        checked={draft.notifyCustomer}
        onCheckedChange={(value) => set('notifyCustomer', value)}
        label={t('notifyCustomer')}
      />
      {draft.notifyCustomer && (
        <div className="flex flex-col gap-5 rounded-xl border border-hairline p-4">
          <p className="type-body-sm text-ink-muted">{t('messageLiveHint')}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('notifyEvent')} error={errors.notifyEvent}>
              <Select
                value={draft.notifyEvent}
                onValueChange={(value) => set('notifyEvent', value)}
                options={TASK_NOTIFY_EVENTS.map((value) => ({
                  value,
                  label: t(`eventOptions.${value}`),
                }))}
              />
            </Field>
            <Field label={t('message')} error={errors.messageKey}>
              <Select
                value={draft.messageKey}
                onValueChange={(value) => set('messageKey', value)}
                options={choices.map(({ key, off }) => {
                  const name = nameT.has(key) ? nameT(key) : key;
                  return { value: key, label: off ? t('messageOff', { name }) : name };
                })}
              />
            </Field>
          </div>
          <Field
            label={t('customerTitle')}
            hint={t('customerTitleHint')}
            error={errors.customerTitle}
          >
            <Input
              value={draft.customerTitle ?? ''}
              onChange={(e) => set('customerTitle', e.target.value)}
            />
          </Field>
          <TaskMessageReach draft={draft} set={set} errors={errors} />
          {preview && (
            <div className="flex flex-col gap-1.5 rounded-lg bg-sunken px-4 py-3">
              <p className="type-label text-ink-faint">{t('preview')}</p>
              <p className="type-body-sm text-ink">{preview}</p>
            </div>
          )}
        </div>
      )}
      <Switch
        checked={draft.notifyManager}
        onCheckedChange={(value) => set('notifyManager', value)}
        label={t('notifyManager')}
      />
      <Switch
        checked={draft.active}
        onCheckedChange={(value) => set('active', value)}
        label={t('active')}
      />
    </div>
  );
}
