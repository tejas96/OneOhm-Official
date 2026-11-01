'use client';

import type { QuotationDetail } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Textarea, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';

/** Records why the customer said no; the reason stays on the quotation for later review. */
export function RejectDialog({
  quotation,
  open,
  onOpenChange,
}: {
  readonly quotation: QuotationDetail;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('quotations.reject');
  const toast = useToast();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const reject = useMutation({
    mutationFn: () =>
      expectStatus(
        api.quotations.rejectQuotation({
          params: { id: quotation.id },
          body: { reason: reason.trim() },
        }),
        200,
      ),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['quotation', quotation.id], updated);
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      toast({ tone: 'success', title: t('done'), reference: updated.number });
      setReason('');
      onOpenChange(false);
    },
  });
  const error = reject.error;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    reject.mutate();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description', { number: quotation.number })}
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="submit"
            form="reject-quotation"
            variant="danger"
            pending={reject.isPending}
            disabled={reason.trim().length < 2}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <form id="reject-quotation" onSubmit={submit} className="flex flex-col gap-3">
        <Field
          label={t('reason')}
          hint={t('reasonHint')}
          error={
            error instanceof ApiError
              ? (error.fieldErrors.reason ?? describeError(error))
              : error
                ? describeError(error)
                : undefined
          }
          required
        >
          <Textarea
            value={reason}
            maxLength={300}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
