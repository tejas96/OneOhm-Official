'use client';

import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useMonthFormat } from './month-format';
import { useMonthActions } from './use-month-sheet';

/** Opens a locked month again; the reason is kept in its history for everyone to read. */
export function UnlockDialog({
  open,
  month,
  onClose,
}: {
  readonly open: boolean;
  readonly month: string;
  readonly onClose: () => void;
}) {
  const t = useTranslations('team.monthSheet.unlock');
  const toast = useToast();
  const form = useApiForm();
  const { unlock } = useMonthActions();
  const name = useMonthFormat().monthName(month);
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const { reset } = form;
  const short = reason.trim().length < 5;

  useEffect(() => {
    if (!open) return;
    setReason('');
    setChecked(false);
    reset();
  }, [open, reset]);

  const confirm = () => {
    setChecked(true);
    if (short) return;
    return form.run(
      () => unlock(month, reason.trim()),
      () => {
        toast({ title: t('done', { month: name }), tone: 'success' });
        onClose();
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t('title', { month: name })}
      description={t('body')}
      size="sm"
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" pending={form.pending} onClick={confirm}>
            {t('confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          error={checked && short ? t('reasonError') : (form.fieldErrors.reason ?? null)}
          required
        >
          <Textarea
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
