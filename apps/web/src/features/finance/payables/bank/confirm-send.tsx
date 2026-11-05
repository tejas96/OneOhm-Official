'use client';

import { Button } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Landmark } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';

/** The second look before money leaves: amount, name and last four digits, then Yes, send. */
export function ConfirmSend({
  amountPaise,
  name,
  last4,
  pending,
  error,
  onYes,
  onBack,
}: {
  readonly amountPaise: number;
  readonly name: string;
  readonly last4: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onYes: () => void;
  readonly onBack: () => void;
}) {
  const t = useTranslations('finance.payables.bank.confirm');
  return (
    <div className="flex flex-col gap-4">
      <p className="type-body font-medium text-ink">
        {t('question', { amount: formatInr(amountPaise), name, last4 })}
      </p>
      <FormError message={error} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={pending} onClick={onBack}>
          {t('back')}
        </Button>
        <Button variant="primary" leadingIcon={<Landmark />} pending={pending} onClick={onYes}>
          {t('yes')}
        </Button>
      </div>
    </div>
  );
}
