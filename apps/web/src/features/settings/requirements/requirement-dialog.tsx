'use client';

import type { DocumentRequirementInput, DocumentRequirementRecord } from '@oneohm/api-contracts';
import {
  Button,
  Checkbox,
  Dialog,
  Field,
  Input,
  SegmentedControl,
  Select,
  Textarea,
} from '@oneohm/design-system/web';
import { DOCUMENT_CATEGORIES, type DocumentCategory, PROJECT_TYPES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { useFolderLabel } from '@/features/documents/gallery/use-labels';
import { useChangeRequirements } from './use-requirements';

type Rule = DocumentRequirementInput['conditions'] & {};
type Tri = 'any' | 'yes' | 'no';
const FLAGS = ['loan', 'subsidy', 'nameChange'] as const;
const triOf = (value: boolean | undefined): Tri =>
  value === undefined ? 'any' : value ? 'yes' : 'no';
const boolOf = (value: Tri): boolean | undefined => (value === 'any' ? undefined : value === 'yes');

interface Draft {
  label: string;
  why: string;
  category: DocumentCategory;
  fromCustomer: boolean;
  rule: NonNullable<Rule>;
  discomText: string;
}

const draftOf = (item: DocumentRequirementRecord | null): Draft => ({
  label: item?.label ?? '',
  why: item?.why ?? '',
  category: item?.categories[0] ?? 'other',
  fromCustomer: item?.fromCustomer ?? false,
  rule: item?.conditions ?? {},
  discomText: (item?.conditions.discomCodes ?? []).join(', '),
});

/** Name a required paper, its folder, and the rule for which projects need it. */
export function RequirementDialog({
  open,
  requirement,
  onClose,
}: {
  readonly open: boolean;
  /** null adds a new paper. */
  readonly requirement: DocumentRequirementRecord | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.requirements.dialog');
  const typeT = useTranslations('commandCenter.filters.types');
  const folderLabel = useFolderLabel();
  const formId = useId();
  const change = useChangeRequirements(onClose);
  const [draft, setDraft] = useState<Draft>(draftOf(null));
  useEffect(() => {
    if (open) setDraft(draftOf(requirement));
  }, [open, requirement]);
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const setRule = (patch: Partial<NonNullable<Rule>>) =>
    setDraft((current) => ({ ...current, rule: { ...current.rule, ...patch } }));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const codes = draft.discomText
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    const { discomCodes: _old, ...rule } = draft.rule;
    const body = {
      label: draft.label.trim(),
      why: draft.why.trim(),
      categories: [draft.category],
      fromCustomer: draft.fromCustomer,
      conditions: { ...rule, ...(codes.length ? { discomCodes: codes } : {}) },
    };
    if (requirement) change.mutate({ kind: 'update', key: requirement.key, body });
    else change.mutate({ kind: 'add', body });
  };
  const types = draft.rule.types ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={requirement ? t('editTitle', { name: requirement.label }) : t('addTitle')}
      description={t('description')}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={change.isPending}
            disabled={draft.label.trim().length < 3}
          >
            {requirement ? t('save') : t('add')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <Field label={t('label')} required>
          <Input
            value={draft.label}
            maxLength={120}
            onChange={(e) => set({ label: e.target.value })}
          />
        </Field>
        <Field label={t('why')}>
          <Textarea
            value={draft.why}
            rows={2}
            maxLength={200}
            onChange={(e) => set({ why: e.target.value })}
          />
        </Field>
        <Field label={t('folder')} hint={t('folderHint')}>
          <Select
            value={draft.category}
            onValueChange={(category) => set({ category })}
            options={DOCUMENT_CATEGORIES.map((value) => ({ value, label: folderLabel(value) }))}
          />
        </Field>
        <Checkbox
          checked={draft.fromCustomer}
          onCheckedChange={(fromCustomer) => set({ fromCustomer })}
          label={t('fromCustomer')}
          description={t('fromCustomerHint')}
        />
        <Field label={t('types')} hint={t('typesHint')}>
          <div className="flex flex-wrap gap-x-5">
            {PROJECT_TYPES.map((type) => (
              <Checkbox
                key={type}
                checked={types.includes(type)}
                label={typeT(type)}
                onCheckedChange={(on) =>
                  setRule({ types: on ? [...types, type] : types.filter((item) => item !== type) })
                }
              />
            ))}
          </div>
        </Field>
        {FLAGS.map((flag) => (
          <div key={flag} className="flex flex-wrap items-center justify-between gap-3">
            <span className="type-body-sm text-ink">{t(`flags.${flag}`)}</span>
            <SegmentedControl<Tri>
              label={t(`flags.${flag}`)}
              size="sm"
              value={triOf(draft.rule[flag])}
              onValueChange={(value) => setRule({ [flag]: boolOf(value) })}
              options={(['any', 'yes', 'no'] as const).map((value) => ({
                value,
                label: t(`tri.${value}`),
              }))}
            />
          </div>
        ))}
        <Field label={t('discoms')} hint={t('discomsHint')}>
          <Input
            value={draft.discomText}
            className="font-mono uppercase"
            onChange={(e) => set({ discomText: e.target.value })}
          />
        </Field>
      </form>
    </Dialog>
  );
}
