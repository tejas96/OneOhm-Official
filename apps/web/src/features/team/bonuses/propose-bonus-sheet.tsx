'use client';

import { Button, Field, Input, Select, Sheet, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '@/features/settings/number-input';
import { useApiForm } from '@/lib/forms/use-api-form';
import { usePeople } from '../use-team';
import { BonusPeopleRows, type ShareDraft } from './bonus-people-rows';
import { useBonusActions, useBonusProjects } from './use-bonuses';

const NO_PROJECT = 'none';
const FIRST_ROW: ShareDraft = { key: 1, userId: '', shares: 1 };

/**
 * Propose a bonus for people's work, usually on one project (PRD 3.12, 4.7). Someone who
 * approves payments decides it; approved, finance pays each share like any other bill.
 */
export function ProposeBonusSheet({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('team.bonuses.propose');
  const formId = useId();
  const toast = useToast();
  const form = useApiForm();
  const actions = useBonusActions();
  const people = usePeople();
  const projects = useBonusProjects(open);
  const [projectId, setProjectId] = useState(NO_PROJECT);
  const [reason, setReason] = useState('');
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<ShareDraft[]>([FIRST_ROW]);
  const { reset } = form;

  useEffect(() => {
    if (!open) return;
    setProjectId(NO_PROJECT);
    setReason('');
    setTotal(null);
    setRows([FIRST_ROW]);
    reset();
  }, [open, reset]);

  const staff = (people.data ?? []).filter(
    (person) => person.status === 'active' && person.roles.some((role) => role.kind === 'staff'),
  );
  const projectOptions = [
    { value: NO_PROJECT, label: t('noProject') },
    ...(projects.data ?? []).map((project) => ({
      value: project.id,
      label: `${project.code} · ${project.name}`,
    })),
  ];

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const created = await form.run(() =>
      actions.propose({
        projectId: projectId === NO_PROJECT ? null : projectId,
        reason,
        totalPaise: total ?? 0,
        people: rows
          .filter((row) => row.userId !== '')
          .map((row) => ({ userId: row.userId, shares: row.shares })),
      }),
    );
    if (!created) return;
    toast({ title: t('sent'), reference: created.reason, tone: 'success' });
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      width="lg"
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button type="submit" form={formId} variant="primary" pending={form.pending}>
            {t('send')}
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
        <Field label={t('project')} hint={t('projectHint')} error={form.fieldErrors.projectId}>
          <Select value={projectId} onValueChange={setProjectId} options={projectOptions} />
        </Field>
        <Field label={t('reason')} hint={t('reasonHint')} error={form.fieldErrors.reason} required>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Field
          label={t('amount')}
          hint={t('amountHint')}
          error={form.fieldErrors.totalPaise}
          required
          className="max-w-xs"
        >
          <NumberInput unit="paise" value={total} onValueChange={setTotal} />
        </Field>
        <section className="flex flex-col gap-3 border-t border-hairline pt-6">
          <div className="flex flex-col gap-0.5">
            <h3 className="type-overline text-ink-faint uppercase">{t('people')}</h3>
            <p className="type-body-sm text-ink-faint">{t('peopleHint')}</p>
          </div>
          <BonusPeopleRows
            rows={rows}
            onChange={setRows}
            people={staff}
            totalPaise={total ?? 0}
            error={form.fieldErrors.people}
          />
        </section>
        <FormError message={form.error} />
      </form>
    </Sheet>
  );
}
