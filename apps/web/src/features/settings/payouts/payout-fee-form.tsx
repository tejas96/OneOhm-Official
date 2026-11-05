'use client';

import type { PaymentSettingsView } from '@oneohm/api-contracts';
import { Card, Field } from '@oneohm/design-system/web';
import { checkPaymentSettings } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { NumberInput } from '../number-input';
import { SaveBar } from '../rules/save-bar';
import { useRuleSettings } from '../rules/use-rule-settings';
import { gstOnFee } from './fee-gst';
import { PAYMENT_SETTINGS_KEY } from './use-payout-setup';

/** The optional RazorpayX fee per payout, shown before sending; saved like other settings. */
export function PayoutFeeForm() {
  const t = useTranslations('settings.bankTransfers.fee');
  const rule = useRuleSettings<PaymentSettingsView>(
    PAYMENT_SETTINGS_KEY,
    () => expectStatus(api.businessSettings.payments(), 200),
    ({ razorpayxFeePaise }) =>
      expectStatus(api.businessSettings.savePayments({ body: { razorpayxFeePaise } }), 200),
    t('title'),
  );
  const { draft, patch, form } = rule;
  if (rule.query.isPending) return <ListSkeleton label={t('loading')} rows={2} />;
  if (rule.query.isError)
    return <LoadError error={rule.query.error} onRetry={() => rule.query.refetch()} />;
  if (!draft) return null;
  const fee = draft.razorpayxFeePaise;
  // The server's own rule, shown while typing: ₹0 to ₹1,000, or empty.
  const feeError = checkPaymentSettings({ razorpayxFeePaise: fee }).razorpayxFeePaise;
  return (
    <form onSubmit={rule.submit} noValidate>
      <Card className="flex flex-col gap-4 p-5">
        <h3 className="type-title-md text-ink">{t('title')}</h3>
        <Field
          label={t('label')}
          hint={t('hint')}
          error={feeError ?? form.fieldErrors.razorpayxFeePaise}
        >
          <div className="sm:max-w-56">
            <NumberInput
              unit="paise"
              value={fee}
              onValueChange={(value) => {
                form.reset();
                patch({ razorpayxFeePaise: value });
              }}
            />
          </div>
        </Field>
        {feeError === undefined && (
          <p className="rounded-md bg-sunken px-4 py-3 type-body-sm text-ink-muted">
            {fee === null
              ? t('unknown')
              : t('gst', {
                  percent: draft.gstPercent,
                  gst: formatInr(gstOnFee(fee, draft.gstPercent)),
                  total: formatInr(fee + gstOnFee(fee, draft.gstPercent)),
                })}
          </p>
        )}
        <SaveBar
          dirty={rule.dirty}
          pending={form.pending}
          blocked={feeError !== undefined}
          error={form.error}
          onDiscard={rule.discard}
        />
      </Card>
    </form>
  );
}
