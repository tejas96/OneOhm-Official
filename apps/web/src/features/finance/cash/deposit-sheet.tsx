'use client';

import type { HandledPayment } from '@oneohm/api-contracts';
import { Button, Field, Input, Sheet, Textarea } from '@oneohm/design-system/web';
import { formatInr, todayIn } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { describeError } from '@/lib/api/api-error';
import { useCreateDeposit } from './use-cash';

/** One bank slip for the ticked cash and cheques: the date, the slip number and a note. */
export function DepositSheet({
  items,
  open,
  onOpenChange,
  onDone,
}: {
  readonly items: readonly HandledPayment[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDone: () => void;
}) {
  const t = useTranslations('finance.cash.deposit');
  const [depositedOn, setDepositedOn] = useState(todayIn());
  const [bankReference, setBankReference] = useState('');
  const [note, setNote] = useState('');
  const create = useCreateDeposit(() => {
    setBankReference('');
    setNote('');
    onDone();
  });
  const total = (method: 'cash' | 'cheque') =>
    items.filter((item) => item.method === method).reduce((sum, item) => sum + item.amountPaise, 0);
  const submit = () =>
    create.mutate({
      depositedOn,
      bankReference: bankReference.trim() || null,
      note: note.trim(),
      paymentIds: items.map((item) => item.paymentId),
    });
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !create.isPending && onOpenChange(next)}
      title={t('title')}
      description={t('description', { count: items.length })}
      footer={
        <>
          <Button variant="quiet" disabled={create.isPending} onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            pending={create.isPending}
            disabled={items.length === 0}
            onClick={submit}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6 px-5 py-6 sm:px-6">
        <dl className="grid grid-cols-2 gap-4 rounded-xl border border-hairline p-4">
          <div className="flex flex-col gap-1">
            <dt className="type-label text-ink-faint">{t('cash')}</dt>
            <dd className="font-mono text-ink tabular-nums">{formatInr(total('cash'))}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="type-label text-ink-faint">{t('cheques')}</dt>
            <dd className="font-mono text-ink tabular-nums">{formatInr(total('cheque'))}</dd>
          </div>
        </dl>
        <Field label={t('date')} required>
          <Input
            type="date"
            value={depositedOn}
            onChange={(event) => setDepositedOn(event.target.value)}
          />
        </Field>
        <Field label={t('reference')} hint={t('referenceHint')}>
          <Input
            value={bankReference}
            maxLength={60}
            onChange={(event) => setBankReference(event.target.value)}
          />
        </Field>
        <Field
          label={t('note')}
          error={create.isError ? `${t('failed')}: ${describeError(create.error)}` : null}
        >
          <Textarea
            value={note}
            rows={2}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <p className="type-body-sm text-ink-faint">{t('chequesNote')}</p>
      </div>
    </Sheet>
  );
}
