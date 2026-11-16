'use client';

import type { TravelClaim } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import { FormError } from '@/components/form-error';
import { useApiForm } from '@/lib/forms/use-api-form';
import { useVoidClaim } from './use-travel';

/**
 * Voids an approved claim that is not paid yet: the bill is cancelled and its ledger entry
 * reversed. A reason is required and the worker sees it; they can claim the day again.
 */
export function VoidClaimDialog({
  claim,
  onClose,
  onDone,
}: {
  readonly claim: TravelClaim | null;
  readonly onClose: () => void;
  readonly onDone: () => void;
}) {
  const t = useTranslations('siteActivity.claims.void');
  const formId = useId();
  const toast = useToast();
  const voidClaim = useVoidClaim();
  const form = useApiForm();
  const [reason, setReason] = useState('');

  const close = () => {
    setReason('');
    form.reset();
    onClose();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!claim) return;
    await form.run(
      () => voidClaim(claim.id, reason.trim()),
      () => {
        toast({ title: t('done'), reference: claim.user.fullName, tone: 'success' });
        setReason('');
        onDone();
      },
    );
  };

  return (
    <Dialog
      open={claim !== null}
      onOpenChange={(open) => !open && close()}
      title={t('title')}
      description={claim ? t('description', { amount: formatInr(claim.amountPaise) }) : undefined}
      autoFocusField
      footer={
        <>
          <Button type="button" variant="quiet" onClick={close}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="danger"
            pending={form.pending}
            disabled={reason.trim() === ''}
          >
            {t('submit')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label={t('reason')} hint={t('reasonHint')} required error={form.fieldErrors.reason}>
          <Textarea
            value={reason}
            rows={3}
            onChange={(event) => {
              setReason(event.target.value);
              // An old "say why" must not stay on screen once the person is typing one.
              if (form.error || form.fieldErrors.reason) form.reset();
            }}
          />
        </Field>
        <FormError message={form.error} />
      </form>
    </Dialog>
  );
}
