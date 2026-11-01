'use client';

import { Field, Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';

type BankKey = 'bankAccountName' | 'bankIfsc' | 'bankAccountNumber';

/**
 * Where bills are paid by bank transfer (RazorpayX). The saved account number is never
 * shown in full; typing a new one replaces it.
 */
export function VendorBankFields({
  text,
  errors,
  savedAccount,
}: {
  readonly text: (key: BankKey) => {
    value: string;
    onChange: (event: { target: { value: string } }) => void;
  };
  readonly errors: Readonly<Record<string, string>>;
  readonly savedAccount: string | null;
}) {
  const t = useTranslations('inventory.vendorForm.bank');
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-hairline p-4">
      <legend className="px-1 type-label text-ink-faint">{t('title')}</legend>
      <p className="type-body-sm text-ink-faint">{t('hint')}</p>
      <Field label={t('name')} error={errors.bankAccountName}>
        <Input autoComplete="off" {...text('bankAccountName')} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ifsc')} error={errors.bankIfsc}>
          <Input className="font-mono uppercase" autoComplete="off" {...text('bankIfsc')} />
        </Field>
        <Field
          label={t('number')}
          hint={savedAccount ? t('keep', { account: savedAccount }) : undefined}
          error={errors.bankAccountNumber}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            placeholder={savedAccount ?? ''}
            {...text('bankAccountNumber')}
          />
        </Field>
      </div>
    </fieldset>
  );
}
