'use client';

import { Button, Field } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { NumberInput } from '../../../settings/number-input';
import type { AmountCheck } from '../amount-check';

/**
 * The one amount box of the payout flow (send by bank, Ask to send, Record a payment made).
 * It judges the amount on every keystroke: the problem shows under the box at once, "Left
 * after this" never shows ₹0 for too much money, and "Pay all" puts back what is left.
 * `serverError` is a field error the server sent (for example someone else paid meanwhile).
 */
export function AmountBox({
  label,
  hint,
  amount,
  left,
  check,
  serverError,
  onChange,
}: {
  readonly label: string;
  readonly hint: string;
  readonly amount: number | null;
  readonly left: number;
  readonly check: AmountCheck;
  readonly serverError?: string | null | undefined;
  readonly onChange: (value: number | null) => void;
}) {
  const t = useTranslations('finance.payables.amountCheck');
  const error =
    check.status === 'empty'
      ? t('empty')
      : check.status === 'over'
        ? t('over', { amount: formatInr(check.overBy), left: formatInr(left) })
        : (check.message ?? serverError ?? undefined);
  return (
    <div className="flex flex-col gap-2">
      <Field label={label} hint={hint} required error={error}>
        <NumberInput unit="paise" value={amount} onValueChange={onChange} />
      </Field>
      {check.status === 'ok' && (
        <p className="type-body-sm text-ink-muted">
          {t('leftAfter', { amount: formatInr(left - (amount ?? 0)) })}
        </p>
      )}
      {left > 0 && amount !== left && (
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="self-start"
          onClick={() => onChange(left)}
        >
          {t('payAll', { amount: formatInr(left) })}
        </Button>
      )}
    </div>
  );
}
