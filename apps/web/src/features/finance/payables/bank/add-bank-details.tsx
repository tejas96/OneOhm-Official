'use client';

import type { PayoutOptions } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { type BankValues, bankBody, useBankCheck } from '../../../inventory/vendors/bank-check';
import { VendorBankFields } from '../../../inventory/vendors/vendor-bank-fields';

type Payee = NonNullable<PayoutOptions['payee']>;
type Body = {
  bankAccountName?: string;
  bankIfsc?: string;
  bankAccountNumber?: string;
  bankAccountNumberConfirm?: string;
};

async function saveBank(payee: Payee, body: Body): Promise<void> {
  if (payee.kind === 'vendor')
    await expectStatus(api.inventory.vendors.update({ params: { id: payee.id }, body }), 200);
  else
    await expectStatus(api.contractors.updateContractor({ params: { id: payee.id }, body }), 200);
}

/** Bank details typed in place (spec U3), saved to the vendor or crew with only these fields. */
export function AddBankDetails({ payee }: { readonly payee: Payee }) {
  const t = useTranslations('finance.payables.bank.addBank');
  const toast = useToast();
  const client = useQueryClient();
  const form = useApiForm();
  const [draft, setDraft] = useState<BankValues>({
    bankAccountName: payee.accountName ?? '',
    bankIfsc: payee.ifsc ?? '',
    bankAccountNumber: '',
    bankAccountNumberConfirm: '',
  });
  const [tried, setTried] = useState(false);
  const bank = useBankCheck(draft);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (bank.blocked) {
      setTried(true);
      return;
    }
    // Only what was typed goes: an empty number keeps the saved one.
    const all = bankBody(draft);
    const body: Body = {};
    if (all.bankAccountName) body.bankAccountName = all.bankAccountName;
    if (all.bankIfsc) body.bankIfsc = all.bankIfsc;
    if (all.bankAccountNumber) {
      body.bankAccountNumber = all.bankAccountNumber;
      body.bankAccountNumberConfirm = all.bankAccountNumberConfirm ?? '';
    }
    await form.run(
      () => saveBank(payee, body),
      async () => {
        await client.invalidateQueries();
        toast({ tone: 'success', title: t('saved'), description: t('checkName') });
      },
    );
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <p role="status" className="rounded-md bg-sunken px-3 py-2.5 type-body-sm text-ink-muted">
        {t('intro', { name: payee.name })}
      </p>
      <VendorBankFields
        values={draft}
        onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
        check={bank}
        errors={form.fieldErrors}
        showRequired={tried}
        savedAccount={payee.accountMasked}
      />
      <FormError message={form.error} />
      <Button type="submit" variant="primary" pending={form.pending} disabled={bank.blocked}>
        {t('save')}
      </Button>
    </form>
  );
}
