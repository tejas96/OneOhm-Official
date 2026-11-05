'use client';

import type { Payable } from '@oneohm/api-contracts';
import { Dialog } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { BillPayments } from './bill-payments';

/** The payments on a bill that has none left to pay (or any bill), opened from its row. */
export function BillPaymentsDialog({
  bill,
  onClose,
}: {
  readonly bill: Payable | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.payables.payments');
  return (
    <Dialog
      open={bill !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title')}
      description={bill?.partyName}
    >
      {bill && <BillPayments bill={bill} bare />}
    </Dialog>
  );
}
