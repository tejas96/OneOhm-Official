'use client';

import { Field, Input } from '@oneohm/design-system/web';
import { cleanAccountNumber, cleanIfsc } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { BANK_KEY, type BankCheck, type BankValues } from './bank-check';

const titleCase = (text: string) =>
  text
    .toLowerCase()
    .replace(/(^|[\s-])([a-z])/g, (_, gap: string, letter: string) => gap + letter.toUpperCase());

/**
 * Where bills are paid by bank transfer (RazorpayX). One set of fields for vendors,
 * contractors and the Pay dialog. Mistakes show as you type; a NEW account number must be
 * typed twice. The saved number is never shown in full; typing a new one replaces it.
 */
export function VendorBankFields({
  values,
  onChange,
  check,
  errors,
  savedAccount,
  showRequired = false,
  bare = false,
}: {
  readonly values: BankValues;
  readonly onChange: (key: keyof BankValues, value: string) => void;
  readonly check: BankCheck;
  /** What the server said, by field; shown when nothing typed explains it. */
  readonly errors: Readonly<Record<string, string>>;
  readonly savedAccount: string | null;
  /** The person tried to save: show what is still missing, not only what is wrong. */
  readonly showRequired?: boolean;
  /** No frame or heading, for forms that already have their own. */
  readonly bare?: boolean;
}) {
  const t = useTranslations('inventory.vendorForm.bank');
  const newNumber = cleanAccountNumber(values.bankAccountNumber) !== '';
  const errorOf = (field: keyof typeof BANK_KEY): string | undefined => {
    const problem = check.problems[field];
    const missing = problem === 'name_required' || problem === 'confirm_required';
    if (problem && (!missing || showRequired)) return t(`problems.${problem}`);
    return problem ? undefined : errors[BANK_KEY[field]];
  };
  const ifscError =
    errorOf('ifsc') ?? (check.ifsc.kind === 'not_found' ? t('ifscNotFound') : undefined);
  const branch = check.ifsc.kind === 'found' ? check.ifsc.branch : null;
  const ifscHint = branch
    ? `${branch.bank.toUpperCase()} · ${[branch.branch, branch.city]
        .filter(Boolean)
        .map((part) => titleCase(part ?? ''))
        .join(', ')}`
    : check.ifsc.kind === 'checking'
      ? t('ifscChecking')
      : check.ifsc.kind === 'unavailable'
        ? t('ifscUnavailable')
        : undefined;
  const Frame = bare ? 'div' : 'fieldset';
  return (
    <Frame
      className={
        bare ? 'flex flex-col gap-3' : 'flex flex-col gap-3 rounded-xl border border-hairline p-4'
      }
    >
      {!bare && <legend className="px-1 type-label text-ink-faint">{t('title')}</legend>}
      {!bare && <p className="type-body-sm text-ink-faint">{t('hint')}</p>}
      <Field label={t('name')} error={errorOf('name')}>
        <Input
          autoComplete="off"
          value={values.bankAccountName}
          onChange={(event) => onChange('bankAccountName', event.target.value)}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ifsc')} hint={ifscHint} error={ifscError}>
          <Input
            className="font-mono uppercase"
            autoComplete="off"
            autoCapitalize="characters"
            value={values.bankIfsc}
            onChange={(event) => onChange('bankIfsc', cleanIfsc(event.target.value))}
          />
        </Field>
        <Field
          label={t('number')}
          hint={savedAccount ? t('keep', { account: savedAccount }) : undefined}
          error={errorOf('number')}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            placeholder={savedAccount ?? ''}
            value={values.bankAccountNumber}
            onChange={(event) =>
              onChange('bankAccountNumber', cleanAccountNumber(event.target.value))
            }
          />
        </Field>
      </div>
      {newNumber && (
        <Field label={t('confirm')} hint={t('confirmHint')} error={errorOf('confirm')}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            className="font-mono"
            value={values.bankAccountNumberConfirm}
            onChange={(event) =>
              onChange('bankAccountNumberConfirm', cleanAccountNumber(event.target.value))
            }
            // Typed again by hand, not pasted: that is the check.
            onPaste={(event) => event.preventDefault()}
          />
        </Field>
      )}
    </Frame>
  );
}
