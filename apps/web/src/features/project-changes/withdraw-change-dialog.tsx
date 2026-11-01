'use client';

import type { ProjectChange } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useChangeActions } from './use-project-changes';

/** Drops an open change with a reason; the project stays as it is. */
export function WithdrawChangeDialog({
  change,
  onClose,
}: {
  readonly change: ProjectChange | null;
  readonly onClose: () => void;
}) {
  const t = useTranslations('scopeChanges.withdraw');
  const toast = useToast();
  const form = useApiForm();
  const [reason, setReason] = useState('');
  const { withdraw } = useChangeActions(change?.projectId ?? '');

  const confirm = async () => {
    if (!change) return;
    const done = await form.run(() => withdraw(change.id, reason));
    if (!done) return;
    toast({ tone: 'success', title: t('done', { number: change.number }) });
    setReason('');
    onClose();
  };

  return (
    <Dialog
      open={change !== null}
      onOpenChange={(next) => {
        if (!next) {
          form.reset();
          onClose();
        }
      }}
      title={t('title', { number: change?.number ?? 0 })}
      size="sm"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            pending={form.pending}
            onClick={confirm}
            disabled={reason.trim().length < 3}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="type-body text-ink-muted">{t('body')}</p>
        <Field label={t('reason')} error={form.fieldErrors.reason}>
          <Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError message={form.error} />
      </div>
    </Dialog>
  );
}
