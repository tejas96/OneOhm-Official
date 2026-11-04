'use client';

import type { PayoutDetailsView } from '@oneohm/api-contracts';
import { Field, Input, SegmentedControl } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import type { ApiFormState } from '@/lib/forms/use-api-form';
import {
  checkDraft,
  draftFrom,
  fieldsFor,
  type PayoutDraft,
  type PayoutField,
  type PayoutMethod,
  type PayoutProblems,
  payloadOf,
} from './payout-draft';
import { savePayoutDetails } from './use-payouts';

const METHODS: readonly PayoutMethod[] = ['upi', 'bank'];
const UPPER: ReadonlySet<PayoutField> = new Set(['pan', 'bankIfsc']);
const MONO: ReadonlySet<PayoutField> = new Set(['pan', 'bankIfsc', 'bankAccountNumber']);
const MAX: Readonly<Record<PayoutField, number>> = {
  upiId: 60,
  bankAccountName: 120,
  bankAccountNumber: 18,
  bankIfsc: 11,
  pan: 10,
};

/**
 * UPI or bank account (only that way's boxes show), then PAN. The sheet owns the submit
 * button, so `form` is shared with it.
 */
export function PayoutDetailsForm({
  formId,
  resellerId,
  saved,
  form,
  onSaved,
}: {
  readonly formId: string;
  readonly resellerId: string;
  readonly saved: PayoutDetailsView | null;
  readonly form: ApiFormState;
  readonly onSaved: (saved: PayoutDetailsView) => Promise<void>;
}) {
  const t = useTranslations('finance.payouts.detailsPanel');
  const [draft, setDraft] = useState<PayoutDraft>(() => draftFrom(saved));
  const [problems, setProblems] = useState<PayoutProblems>({});
  const missing = (field: PayoutField) => t(`missing.${field}`);

  const setValue = (field: PayoutField, text: string) =>
    setDraft((current) => ({
      ...current,
      values: { ...current.values, [field]: UPPER.has(field) ? text.toUpperCase() : text },
    }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = checkDraft(draft, missing);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    await form.run(() => savePayoutDetails(resellerId, payloadOf(draft)), onSaved);
  };

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <SegmentedControl
        value={draft.method}
        onValueChange={(method) => {
          setDraft((current) => ({ ...current, method }));
          setProblems({});
        }}
        label={t('methodLabel')}
        options={METHODS.map((value) => ({ value, label: t(`methods.${value}`) }))}
      />
      {fieldsFor(draft.method).map((field) => (
        <Field
          key={field}
          label={t(`fields.${field}`)}
          required
          hint={field === 'upiId' || field === 'pan' ? t(`hints.${field}`) : undefined}
          error={problems[field] ?? form.fieldErrors[field]}
        >
          <Input
            value={draft.values[field]}
            onChange={(event) => setValue(field, event.target.value)}
            placeholder={draft.kept[field]}
            maxLength={MAX[field]}
            inputMode={field === 'bankAccountNumber' ? 'numeric' : undefined}
            autoComplete="off"
            spellCheck={false}
            className={MONO.has(field) ? 'font-mono' : undefined}
          />
        </Field>
      ))}
      <FormError message={form.error} />
    </form>
  );
}
