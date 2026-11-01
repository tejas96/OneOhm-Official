'use client';

import { Button, Dialog, Field, Input, Select, useToast } from '@oneohm/design-system/web';
import { addDays, todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../../settings/number-input';
import { useInvalidateFinance } from '../use-finance';

const NO_PROJECT = 'none';

const EMPTY = () => ({
  party: 'vendor' as 'vendor' | 'contractor',
  partyName: '',
  description: '',
  billNumber: '',
  amountPaise: null as number | null,
  dueOn: addDays(todayIn(), 15),
  projectId: NO_PROJECT,
});

/** A bill from a vendor or crew, entered by finance. It waits for approval before payment. */
export function AddBillDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('finance.payables.addDialog');
  const partyT = useTranslations('finance.payables.party');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const [draft, setDraft] = useState(EMPTY);
  const projects = useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
    enabled: open,
  });
  const set = <K extends keyof ReturnType<typeof EMPTY>>(
    key: K,
    value: ReturnType<typeof EMPTY>[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setDraft(EMPTY());
      form.reset();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.run(() =>
      expectStatus(
        api.finance.createPayable({
          body: {
            party: draft.party,
            partyName: draft.partyName,
            description: draft.description,
            billNumber: draft.billNumber.trim() || null,
            amountPaise: draft.amountPaise ?? 0,
            dueOn: draft.dueOn,
            projectId: draft.projectId === NO_PROJECT ? null : draft.projectId,
          },
        }),
        201,
      ),
    );
    if (!created) return;
    await invalidate();
    toast({ title: t('added'), description: created.partyName, tone: 'success' });
    close(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title={t('title')}
      description={t('description')}
      size="lg"
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('submit')}
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label={t('partyName')} required error={form.fieldErrors.partyName}>
          <Input
            value={draft.partyName}
            onChange={(event) => set('partyName', event.target.value)}
          />
        </Field>
        <Field label={t('party')} error={form.fieldErrors.party}>
          <Select
            value={draft.party}
            onValueChange={(value) => set('party', value)}
            options={(['vendor', 'contractor'] as const).map((value) => ({
              value,
              label: partyT(value),
            }))}
          />
        </Field>
        <Field
          label={t('descriptionLabel')}
          required
          error={form.fieldErrors.description}
          className="sm:col-span-2"
        >
          <Input
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </Field>
        <Field label={t('amount')} required error={form.fieldErrors.amountPaise}>
          <NumberInput
            unit="paise"
            value={draft.amountPaise}
            onValueChange={(value) => set('amountPaise', value)}
          />
        </Field>
        <Field label={t('dueOn')} required error={form.fieldErrors.dueOn}>
          <Input
            type="date"
            value={draft.dueOn}
            onChange={(event) => set('dueOn', event.target.value)}
          />
        </Field>
        <Field
          label={t('billNumber')}
          hint={t('billNumberHint')}
          error={form.fieldErrors.billNumber}
        >
          <Input
            value={draft.billNumber}
            onChange={(event) => set('billNumber', event.target.value)}
          />
        </Field>
        <Field label={t('project')} error={form.fieldErrors.projectId}>
          <Select
            value={draft.projectId}
            onValueChange={(value) => set('projectId', value)}
            options={[
              { value: NO_PROJECT, label: t('noProject') },
              ...(projects.data ?? []).map((project) => ({
                value: project.id,
                label: `${project.code} · ${project.name}`,
              })),
            ]}
          />
        </Field>
        <div className="sm:col-span-2">
          <FormError message={form.error} />
        </div>
      </form>
    </Dialog>
  );
}
