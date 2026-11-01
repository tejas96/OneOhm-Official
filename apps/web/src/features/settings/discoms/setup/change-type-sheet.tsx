'use client';

import type { ChangeRequestTypeSetting, Discom } from '@oneohm/api-contracts';
import { Button, Checkbox, Field, Input, Sheet, Switch, useToast } from '@oneohm/design-system/web';
import {
  CHANGE_REQUEST_INPUT_KEYS,
  CUSTOMER_DOCUMENT_CATEGORIES,
  type DocumentCategory,
} from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useRoleOptions } from '../../templates/use-templates';
import { bodyFrom, type ChangeTypeDraft, draftFrom, toggled } from './change-type-draft';
import { StepListEditor } from './step-list-editor';
import { useSaveChangeType } from './use-discom-setup';

/** Edit one DISCOM's change-request type: name, on/off, fields, papers and steps. */
export function ChangeTypeSheet({
  discom,
  editing,
  onClose,
}: {
  readonly discom: Discom;
  readonly editing: ChangeRequestTypeSetting | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('discomSetup');
  const fieldT = useTranslations('discom.fields');
  const docT = useTranslations('documents.categories');
  const formId = useId();
  const form = useApiForm();
  const toast = useToast();
  const save = useSaveChangeType(discom.id);
  const roles = useRoleOptions();
  const [draft, setDraft] = useState<ChangeTypeDraft>(() => draftFrom(editing));
  const set = <K extends keyof ChangeTypeDraft>(key: K, value: ChangeTypeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const errors = form.fieldErrors;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const saved = await form.run(() =>
      save(editing?.id ?? null, bodyFrom(draft, CHANGE_REQUEST_INPUT_KEYS)),
    );
    if (!saved) return;
    toast({ tone: 'success', title: t(editing ? 'saved' : 'added', { name: saved.title }) });
    onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(next) => !next && onClose()}
      title={
        editing
          ? t('changes.sheet.editTitle', { name: editing.title })
          : t('changes.sheet.createTitle')
      }
      description={t('changes.sheet.intro', { discom: discom.code })}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-6 px-5 py-6 sm:px-6"
      >
        {editing && editing.openRequests > 0 && (
          <p className="type-body-sm text-ink-muted">
            {t('changes.sheet.openNote', { count: editing.openRequests })}
          </p>
        )}
        <Field label={t('changes.sheet.name')} error={errors.title} required>
          <Input value={draft.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t('changes.sheet.purpose')} error={errors.description}>
          <Input value={draft.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Switch
          checked={draft.active}
          onCheckedChange={(on) => set('active', on)}
          label={t('changes.sheet.active', { discom: discom.code })}
          description={t('changes.sheet.activeHint')}
        />
        <Field
          label={t('changes.sheet.asks')}
          hint={t('changes.sheet.asksHint')}
          error={errors.fields}
        >
          <div className="flex flex-col gap-1">
            {CHANGE_REQUEST_INPUT_KEYS.map((key) => {
              const asked = draft.fields[key] !== undefined;
              return (
                <div key={key} className="flex flex-wrap items-center gap-x-6">
                  <Checkbox
                    checked={asked}
                    label={fieldT(key)}
                    onCheckedChange={(on) => {
                      const { [key]: _drop, ...rest } = draft.fields;
                      set('fields', on ? { ...rest, [key]: true } : rest);
                    }}
                  />
                  {asked && (
                    <Checkbox
                      checked={draft.fields[key] === true}
                      label={t('changes.sheet.required')}
                      onCheckedChange={(on) => set('fields', { ...draft.fields, [key]: on })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Field>
        <Field
          label={t('changes.sheet.papers')}
          hint={t('changes.sheet.papersHint')}
          error={errors.documents}
        >
          <div className="grid gap-x-5 sm:grid-cols-2">
            {CUSTOMER_DOCUMENT_CATEGORIES.map((category) => (
              <Checkbox
                key={category}
                checked={draft.documents.includes(category)}
                label={docT(category)}
                onCheckedChange={(on) =>
                  set(
                    'documents',
                    toggled<DocumentCategory>(
                      draft.documents,
                      category,
                      on,
                      CUSTOMER_DOCUMENT_CATEGORIES,
                    ),
                  )
                }
              />
            ))}
          </div>
        </Field>
        <Field
          label={t('changes.sheet.steps')}
          hint={t('changes.sheet.stepsHint')}
          error={errors.steps}
        >
          <StepListEditor
            steps={draft.steps}
            onChange={(steps) => set('steps', steps)}
            roles={roles.data ?? []}
            errors={errors}
          />
        </Field>
        <FormError message={form.error ?? errors.updates ?? errors['blocks.taskKeys'] ?? null} />
      </form>
    </Sheet>
  );
}
