'use client';

import { REPORT_KEYS } from '@oneohm/api-contracts';
import { Field, Select } from '@oneohm/design-system/web';
import { CUSTOMER_DOCUMENT_CATEGORIES, TASK_MESSAGE_RECIPIENTS } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import type { SetDraft, TaskDraft } from './task-draft';

const NONE = 'none';

/**
 * Who hears a task's customer message and the link it carries (PRD 6.2 "recipient" and
 * "optional attachments or report links").
 */
export function TaskMessageReach({
  draft,
  set,
  errors,
}: {
  readonly draft: TaskDraft;
  readonly set: SetDraft;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const reportT = useTranslations('reports.short');
  const folderT = useTranslations('documents.categories');
  const links = [
    { value: NONE, label: t('attachmentNone') },
    ...REPORT_KEYS.map((key) => ({
      value: `report:${key}`,
      label: t('attachmentReport', { name: reportT(key) }),
    })),
    ...CUSTOMER_DOCUMENT_CATEGORIES.map((folder) => ({
      value: `document:${folder}`,
      label: t('attachmentFolder', { name: folderT(folder) }),
    })),
  ];
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label={t('recipients')} error={errors.recipients}>
        <Select
          value={draft.recipients}
          onValueChange={(value) => set('recipients', value as TaskDraft['recipients'])}
          options={TASK_MESSAGE_RECIPIENTS.map((value) => ({
            value,
            label: t(`recipientOptions.${value}`),
          }))}
        />
      </Field>
      <Field label={t('attachment')} hint={t('attachmentHint')} error={errors.attachment}>
        <Select
          value={draft.attachment ?? NONE}
          onValueChange={(value) => set('attachment', value === NONE ? null : value)}
          options={links}
        />
      </Field>
    </div>
  );
}
