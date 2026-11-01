'use client';

import type { HandledPayment } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useSettleCheque } from './use-cash';

export type ChequeAction = { readonly kind: 'clear' | 'bounce'; readonly cheque: HandledPayment };

/**
 * Clear: the bank credited the cheque. Bounce: it came back unpaid, so the payment is
 * reversed and the milestone is due again.
 */
export function ChequeDialog({
  action,
  onClose,
}: {
  readonly action: ChequeAction | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('finance.cash.cheque');
  const settle = useSettleCheque(onClose);
  const [date, setDate] = useState(todayIn());
  const [reason, setReason] = useState('');
  const bounce = action?.kind === 'bounce';
  const submit = () => {
    if (!action) return;
    if (action.kind === 'clear')
      settle.mutate({ kind: 'clear', cheque: action.cheque, clearedOn: date });
    else
      settle.mutate({
        kind: 'bounce',
        cheque: action.cheque,
        bouncedOn: date,
        reason: reason.trim(),
      });
  };
  return (
    <Dialog
      open={action !== null}
      onOpenChange={(open) => !open && !settle.isPending && onClose()}
      title={t(bounce ? 'bounceTitle' : 'clearTitle')}
      description={
        action
          ? t('about', {
              number: action.cheque.chequeNumber ?? '',
              amount: formatInr(action.cheque.amountPaise),
              customer: action.cheque.customer,
            })
          : undefined
      }
      footer={
        <>
          <Button variant="quiet" disabled={settle.isPending} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant={bounce ? 'danger' : 'primary'}
            pending={settle.isPending}
            disabled={bounce && reason.trim().length < 3}
            onClick={submit}
          >
            {t(bounce ? 'bounceSubmit' : 'clearSubmit')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 pb-2">
        <Field label={t(bounce ? 'bouncedOn' : 'clearedOn')} required>
          <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
        {bounce && (
          <>
            <Field label={t('reason')} hint={t('reasonHint')} required>
              <Input
                value={reason}
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <p className="type-body-sm text-ink-muted">{t('bounceNote')}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
