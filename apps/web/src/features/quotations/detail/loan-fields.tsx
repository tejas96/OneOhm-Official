'use client';

import { Field, Input, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { usePatternSummary } from '@/features/finance/loans/pattern-summary';
import { useLenders } from '@/features/finance/use-finance';

/** The "Other lender" choice: the name is typed in, and nothing is planned for it. */
export const OTHER_LENDER = 'other';

/** Who lends: a lender from the list (its id), "other" with a typed name, or not yet chosen. */
export interface LenderChoice {
  readonly partnerId: string | undefined;
  readonly name: string;
}

export const NO_LENDER: LenderChoice = { partnerId: undefined, name: '' };

/** The lender part of the create call: the listed lender's id, or the typed name. */
export function lenderFields(loan: boolean, choice: LenderChoice) {
  const listed = loan && choice.partnerId && choice.partnerId !== OTHER_LENDER;
  return {
    lendingPartnerId: listed ? (choice.partnerId ?? null) : null,
    lenderName: loan && !listed ? choice.name.trim() || null : null,
  };
}

/**
 * The loan's lender and amount. A lender from the list brings its documents and plans the
 * bank's share in its parts; any other lender is typed in as before.
 */
export function LoanFields({
  lender,
  onLender,
  loanRupees,
  onLoanRupees,
  errors,
}: {
  readonly lender: LenderChoice;
  readonly onLender: (lender: LenderChoice) => void;
  readonly loanRupees: string;
  readonly onLoanRupees: (rupees: string) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('quotations.project');
  const lenders = useLenders();
  const summary = usePatternSummary();
  const active = (lenders.data ?? []).filter((entry) => entry.active);
  const listless = lenders.isSuccess && active.length === 0;
  const picked = active.find((entry) => entry.id === lender.partnerId);
  const nameInput = (
    <Input
      value={lender.name}
      maxLength={120}
      onChange={(event) => onLender({ ...lender, name: event.target.value })}
    />
  );

  return (
    <div className="grid gap-4 py-4 sm:grid-cols-2">
      {listless ? (
        <Field label={t('lender')} error={errors.lenderName}>
          {nameInput}
        </Field>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label={t('lender')} error={errors.lendingPartnerId}>
            <Select
              value={lender.partnerId}
              onValueChange={(partnerId) => onLender({ ...lender, partnerId })}
              placeholder={t('choose')}
              options={[
                ...active.map((entry) => ({ value: entry.id, label: entry.name })),
                { value: OTHER_LENDER, label: t('lenderOther') },
              ]}
            />
          </Field>
          {lender.partnerId === OTHER_LENDER && (
            <Field label={t('lenderName')} error={errors.lenderName}>
              {nameInput}
            </Field>
          )}
          {picked && (
            <p className="type-body-sm text-ink-muted">
              {picked.disbursement === 'single'
                ? t('lenderPlanSingle')
                : t('lenderPlan', { parts: summary(picked) })}
            </p>
          )}
        </div>
      )}
      <Field label={t('loanAmount')} hint={t('loanAmountHint')} error={errors.loanPaise}>
        <Input
          inputMode="decimal"
          value={loanRupees}
          onChange={(event) => onLoanRupees(event.target.value.replace(/[^\d.]/g, ''))}
          leading={<span className="type-body text-ink-faint">₹</span>}
          className="font-mono"
        />
      </Field>
    </div>
  );
}
