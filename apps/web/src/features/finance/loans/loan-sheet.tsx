'use client';

import type { ProjectLoan } from '@oneohm/api-contracts';
import { Button, Field, Input, Select, Sheet, Textarea, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { NumberInput } from '../../settings/number-input';
import { useInvalidateFinance, useLenders } from '../use-finance';
import {
  DocumentChecklist,
  type DocumentDraft,
  type TrancheDraft,
  TrancheEditor,
} from './loan-parts';

const STATUSES = [
  'collecting_documents',
  'submitted',
  'sanctioned',
  'disbursing',
  'disbursed',
  'rejected',
] as const;
const NO_PARTNER = 'none';

const draftOf = (loan: ProjectLoan) => ({
  lendingPartnerId: loan.lendingPartnerId ?? NO_PARTNER,
  lenderName: loan.lenderName,
  applicationNumber: loan.applicationNumber ?? '',
  status: loan.status,
  sanctionedPaise: loan.sanctionedPaise,
  sanctionedOn: loan.sanctionedOn ?? '',
  notes: loan.notes ?? '',
  documents: loan.documents as DocumentDraft[],
  tranches: loan.tranches.map(
    (tranche): TrancheDraft => ({
      key: tranche.id,
      id: tranche.id,
      label: tranche.label,
      amountPaise: tranche.amountPaise,
      expectedOn: tranche.expectedOn ?? '',
      claimed: tranche.status === 'claimed',
      received: tranche.status === 'received',
    }),
  ),
});
type Draft = ReturnType<typeof draftOf>;

/** Edits a project's loan: lender, documents, sanction and the tranches of the bank share. */
export function LoanSheet({
  loan,
  onClose,
}: {
  readonly loan: ProjectLoan | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.loans.sheet');
  const statusT = useTranslations('finance.loans.status');
  const formId = useId();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const form = useApiForm();
  const lenders = useLenders();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => setDraft(loan ? draftOf(loan) : null), [loan]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const pickPartner = (id: string) => {
    const partner = lenders.data?.find((entry) => entry.id === id);
    setDraft((current) => {
      if (!current) return current;
      const names = new Set(current.documents.map((document) => document.name));
      const extra = (partner?.requiredDocuments ?? []).filter((name) => !names.has(name));
      return {
        ...current,
        lendingPartnerId: id,
        lenderName: partner?.name ?? current.lenderName,
        documents: [...current.documents, ...extra.map((name) => ({ name, received: false }))],
      };
    });
  };

  const close = () => {
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loan || !draft) return;
    const saved = await form.run(() =>
      expectStatus(
        api.finance.saveLoan({
          params: { projectId: loan.projectId },
          body: {
            version: loan.version,
            lendingPartnerId: draft.lendingPartnerId === NO_PARTNER ? null : draft.lendingPartnerId,
            lenderName: draft.lenderName,
            applicationNumber: draft.applicationNumber.trim() || null,
            status: draft.status,
            sanctionedPaise: draft.sanctionedPaise,
            sanctionedOn: draft.sanctionedOn || null,
            documents: draft.documents,
            notes: draft.notes.trim() || null,
            tranches: draft.tranches.map((tranche) => ({
              id: tranche.id,
              label: tranche.label,
              amountPaise: tranche.amountPaise ?? 0,
              expectedOn: tranche.expectedOn || null,
              claimed: tranche.claimed,
            })),
          },
        }),
        200,
      ),
    );
    if (!saved) return;
    await invalidate();
    toast({ title: t('saved'), description: saved.projectCode, tone: 'success' });
    close();
  };

  const planned =
    draft?.tranches.reduce((sum, tranche) => sum + (tranche.amountPaise ?? 0), 0) ?? 0;
  return (
    <Sheet
      open={loan !== null}
      onOpenChange={(open) => !open && close()}
      title={loan ? t('title', { code: loan.projectCode }) : ''}
      description={loan ? t('description', { share: formatInr(loan.bankSharePaise) }) : undefined}
      autoFocusField
      footer={
        <Button type="submit" form={formId} variant="primary" pending={form.pending}>
          {t('save')}
        </Button>
      }
    >
      {draft && loan && (
        <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('partner')} hint={t('partnerHint')}>
              <Select
                value={draft.lendingPartnerId}
                onValueChange={pickPartner}
                options={[
                  { value: NO_PARTNER, label: t('noPartner') },
                  ...(lenders.data ?? [])
                    .filter((entry) => entry.active)
                    .map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
              />
            </Field>
            <Field label={t('lenderName')} required error={form.fieldErrors.lenderName}>
              <Input
                value={draft.lenderName}
                onChange={(event) => set('lenderName', event.target.value)}
              />
            </Field>
            <Field label={t('applicationNumber')} error={form.fieldErrors.applicationNumber}>
              <Input
                value={draft.applicationNumber}
                onChange={(event) => set('applicationNumber', event.target.value)}
              />
            </Field>
            <Field label={t('status')}>
              <Select
                value={draft.status}
                onValueChange={(value) => set('status', value)}
                options={STATUSES.map((value) => ({ value, label: statusT(value) }))}
              />
            </Field>
            <Field label={t('sanctionedAmount')} error={form.fieldErrors.sanctionedPaise}>
              <NumberInput
                unit="paise"
                value={draft.sanctionedPaise}
                onValueChange={(value) => set('sanctionedPaise', value)}
              />
            </Field>
            <Field label={t('sanctionedOn')} error={form.fieldErrors.sanctionedOn}>
              <Input
                type="date"
                value={draft.sanctionedOn}
                onChange={(event) => set('sanctionedOn', event.target.value)}
              />
            </Field>
          </div>
          <section className="flex flex-col gap-2">
            <h3 className="type-title-md text-ink">{t('documentsTitle')}</h3>
            <DocumentChecklist
              documents={draft.documents}
              onChange={(documents) => set('documents', documents)}
            />
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="type-title-md text-ink">{t('tranchesTitle')}</h3>
            <p className="type-body-sm text-ink-faint">
              {t('tranchesHint', {
                share: formatInr(loan.bankSharePaise),
                planned: formatInr(planned),
              })}
            </p>
            <TrancheEditor
              tranches={draft.tranches}
              onChange={(tranches) => set('tranches', tranches)}
              remainingPaise={loan.bankSharePaise - planned}
              error={form.fieldErrors.tranches}
            />
          </section>
          <Field label={t('notes')}>
            <Textarea
              rows={3}
              value={draft.notes}
              onChange={(event) => set('notes', event.target.value)}
            />
          </Field>
          <FormError message={form.error} />
        </form>
      )}
    </Sheet>
  );
}
