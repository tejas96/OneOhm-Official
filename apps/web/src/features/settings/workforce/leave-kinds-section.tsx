'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Badge, Button, Dialog, IconButton } from '@oneohm/design-system/web';
import { CircleAlert, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { SettingsSection } from '../settings-section';
import { LeaveKindDialog } from './leave-kind-dialog';
import { keyEditable } from './leave-kinds';

type Kind = WorkforcePolicyInput['leaveTypes'][number];

const rowErrors = (errors: Readonly<Record<string, string>>, index: number) =>
  ['label', 'key', 'daysPerYear']
    .map((field) => errors[`leaveTypes.${index}.${field}`])
    .filter((message): message is string => Boolean(message));

/** The kinds of leave people can ask for, each with its days a year. */
export function LeaveKindsSection({
  kinds,
  savedKeys,
  onChange,
  errors,
}: {
  readonly kinds: readonly Kind[];
  /** Short names of the kinds as last saved; those can no longer change. */
  readonly savedKeys: readonly string[];
  readonly onChange: (kinds: Kind[]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.workforce.leaveKinds');
  // null: closed; -1: a new kind; otherwise the index being edited.
  const [editing, setEditing] = useState<number | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);
  const editedKind = editing !== null && editing >= 0 ? (kinds[editing] ?? null) : null;
  const removedKind = removing !== null ? kinds[removing] : undefined;

  const save = (kind: Kind) => {
    onChange(
      editing === -1
        ? [...kinds, kind]
        : kinds.map((current, index) => (index === editing ? kind : current)),
    );
    setEditing(null);
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-raised">
        {kinds.map((kind, index) => {
          const problems = rowErrors(errors, index);
          return (
            <li key={kind.key} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate type-title-md text-ink">{kind.label}</p>
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge variant="soft">{t('perYear', { count: kind.daysPerYear })}</Badge>
                    <span className="font-mono text-[0.75rem] text-ink-faint">{kind.key}</span>
                  </p>
                </div>
                <IconButton
                  size="sm"
                  label={t('edit', { name: kind.label })}
                  onClick={() => setEditing(index)}
                >
                  <Pencil aria-hidden />
                </IconButton>
                <IconButton
                  size="sm"
                  label={t('remove', { name: kind.label })}
                  disabled={kinds.length === 1}
                  onClick={() => setRemoving(index)}
                >
                  <Trash2 aria-hidden />
                </IconButton>
              </div>
              {problems.map((problem) => (
                <p
                  key={problem}
                  role="alert"
                  className="flex items-start gap-1.5 type-body-sm text-overdue"
                >
                  <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                  {problem}
                </p>
              ))}
            </li>
          );
        })}
      </ul>
      {errors.leaveTypes && (
        <p role="alert" className="flex items-start gap-1.5 type-body-sm text-overdue">
          <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {errors.leaveTypes}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm text-ink-faint">{t('removeHint')}</p>
        <Button size="sm" leadingIcon={<Plus />} onClick={() => setEditing(-1)}>
          {t('add')}
        </Button>
      </div>
      <LeaveKindDialog
        open={editing !== null}
        kind={editedKind}
        takenKeys={kinds.filter((_, index) => index !== editing).map((kind) => kind.key)}
        keyLocked={!keyEditable(editedKind, savedKeys)}
        onSave={save}
        onClose={() => setEditing(null)}
      />
      <Dialog
        open={removedKind !== undefined}
        onOpenChange={(next) => !next && setRemoving(null)}
        title={t('removeTitle', { name: removedKind?.label ?? '' })}
        size="sm"
        footer={
          <>
            <Button variant="quiet" onClick={() => setRemoving(null)}>
              {t('dialog.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                onChange(kinds.filter((_, other) => other !== removing));
                setRemoving(null);
              }}
            >
              {t('removeConfirm')}
            </Button>
          </>
        }
      >
        <p className="type-body text-ink-muted">{t('removeBody')}</p>
      </Dialog>
    </SettingsSection>
  );
}
