'use client';

import { Field, Select } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { shareSummary, usePaymentPlans } from '@/features/settings/payment-plans/use-payment-plans';

export const DEFAULT_PLAN = 'default';

/** Payment terms for this deal: the ones in the quotation unless someone picks another. */
export function PaymentPlanField({
  value,
  onChange,
  error,
  enabled,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly enabled: boolean;
}) {
  const t = useTranslations('quotations.project');
  const plans = usePaymentPlans(enabled);
  const usable = (plans.data ?? []).filter((plan) => plan.active);
  return (
    <Field label={t('paymentPlan')} hint={t('paymentPlanHint')} error={error}>
      <Select
        value={value}
        onValueChange={onChange}
        options={[
          { value: DEFAULT_PLAN, label: t('paymentPlanQuoted') },
          ...usable.map((plan) => ({
            value: plan.id,
            label: `${plan.name} (${shareSummary(plan)})`,
          })),
        ]}
      />
    </Field>
  );
}
