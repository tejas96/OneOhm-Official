'use client';

import type { LeaveImpact } from '@oneohm/api-contracts';
import { Field, Select, Textarea } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

export const NO_BACKUP = 'none';

/** Who stands in while the person is away, picked from the suggestions, and what they need. */
export function LeaveCoverFields({
  impact,
  backupUserId,
  onBackupChange,
  handoverNote,
  onNoteChange,
  errors,
}: {
  readonly impact: LeaveImpact;
  readonly backupUserId: string;
  readonly onBackupChange: (id: string) => void;
  readonly handoverNote: string;
  readonly onNoteChange: (note: string) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('team.leave.cover');
  const options = [
    { value: NO_BACKUP, label: t('noOne') },
    ...impact.backups.map((person) => ({
      value: person.id,
      label: person.fullName,
      description: t('openTasks', { count: person.openTasks }),
    })),
  ];
  const hint =
    impact.tasks.length > 0 ? t('hintTasks', { count: impact.tasks.length }) : t('hintNoTasks');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="type-title-md text-ink">{t('title')}</h3>
        <p className="type-body-sm text-ink-faint">{t('description')}</p>
      </div>
      {impact.backups.length === 0 ? (
        <p className="rounded-md bg-sunken/70 px-3 py-2.5 type-body-sm text-ink-muted">
          {t('nobodyFree')}
        </p>
      ) : (
        <Field label={t('backup')} hint={hint} error={errors.backupUserId}>
          <Select
            value={
              options.some((option) => option.value === backupUserId) ? backupUserId : NO_BACKUP
            }
            onValueChange={onBackupChange}
            options={options}
          />
        </Field>
      )}
      {backupUserId !== NO_BACKUP && (
        <Field label={t('note')} hint={t('noteHint')} error={errors.handoverNote}>
          <Textarea
            rows={3}
            value={handoverNote}
            onChange={(event) => onNoteChange(event.target.value)}
          />
        </Field>
      )}
    </section>
  );
}
