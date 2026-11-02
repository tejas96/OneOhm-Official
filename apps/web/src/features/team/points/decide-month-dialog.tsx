'use client';

import type { MonthlyRow } from '@oneohm/api-contracts';
import {
  Button,
  Dialog,
  Field,
  SegmentedControl,
  Textarea,
  useToast,
} from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { NumberInput } from '@/features/settings/number-input';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useDecideMonth } from './use-monthly';

type Decision = 'none' | 'bonus';

/**
 * The owner's call for one person's month: no money, or a bonus proposal. A proposal
 * still needs payment approval before anything is paid (spec 3.7).
 */
export function DecideMonthDialog({
  row,
  month,
  monthLabel,
  onClose,
}: {
  readonly row: MonthlyRow | null;
  readonly month: string;
  readonly monthLabel: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.points.monthly.decideDialog');
  const formId = useId();
  const decide = useDecideMonth();
  const toast = useToast();
  const form = useApiForm();
  const [decision, setDecision] = useState<Decision>('none');
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const { reset } = form;

  useEffect(() => {
    if (!row) return;
    setDecision('none');
    setAmount(null);
    setNote('');
    reset();
  }, [row, reset]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!row) return;
    await form.run(
      () =>
        decide(row.user.id, {
          month,
          decision,
          ...(decision === 'bonus' && amount ? { amountPaise: amount } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      () => {
        toast({
          tone: 'success',
          title: t(decision === 'bonus' ? 'proposed' : 'saved', { name: row.user.fullName }),
        });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('title', { name: row?.user.fullName ?? '', month: monthLabel })}
      description={t('description')}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            pending={form.pending}
            disabled={decision === 'bonus' && !amount}
          >
            {t(decision === 'bonus' ? 'submitBonus' : 'submitNone')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-5 pb-2">
        <SegmentedControl
          label={t('decision')}
          value={decision}
          onValueChange={setDecision}
          options={[
            { value: 'none', label: t('none') },
            { value: 'bonus', label: t('bonus') },
          ]}
        />
        {decision === 'bonus' && (
          <Field
            label={t('amount')}
            required
            hint={t('amountHint')}
            error={form.fieldErrors.amountPaise ?? form.fieldErrors.totalPaise}
            className="max-w-xs"
          >
            <NumberInput unit="paise" value={amount} onValueChange={setAmount} />
          </Field>
        )}
        <Field label={t('note')} hint={t('noteHint')} error={form.fieldErrors.note}>
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
