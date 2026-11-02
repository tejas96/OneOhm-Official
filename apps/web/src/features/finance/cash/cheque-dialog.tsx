'use client';

import type { HandledPayment } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { ApiError, describeError } from '@/lib/api/api-error';
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
  const checkT = useTranslations('checks');
  const settle = useSettleCheque(onClose);
  const [date, setDate] = useState(todayIn());
  const [reason, setReason] = useState('');
  const [checks, setChecks] = useState<Record<string, string>>({});
  const bounce = action?.kind === 'bounce';
  const { reset } = settle;
  useEffect(() => {
    if (!action) return;
    setDate(todayIn());
    setReason('');
    setChecks({});
    reset();
  }, [action, reset]);
  const serverErrors = settle.error instanceof ApiError ? settle.error.fieldErrors : {};
  const dateKey = bounce ? 'bouncedOn' : 'clearedOn';
  const fieldError = (key: string) => checks[key] ?? serverErrors[key];
  const submit = () => {
    if (!action || settle.isPending) return;
    const found: Record<string, string> = {};
    if (!date) found[dateKey] = checkT('required');
    else if (date > todayIn()) found[dateKey] = checkT('dateNotFuture');
    if (bounce && reason.trim().length < 3) found.reason = checkT('minChars', { count: 3 });
    setChecks(found);
    if (Object.keys(found).length > 0) return;
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
        <Field label={t(dateKey)} required error={fieldError(dateKey)}>
          <Input
            type="date"
            max={todayIn()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        {bounce && (
          <>
            <Field label={t('reason')} hint={t('reasonHint')} required error={fieldError('reason')}>
              <Input
                value={reason}
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
            <p className="type-body-sm text-ink-muted">{t('bounceNote')}</p>
          </>
        )}
        <FormError message={settle.isError ? describeError(settle.error) : null} />
      </div>
    </Dialog>
  );
}
