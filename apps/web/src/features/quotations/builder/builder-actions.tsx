'use client';

import type { QuotationInput } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError, describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';

/**
 * Save as a draft, or save and send in one step. A discount above the limit is saved
 * and waits for a manager; it is not sent until approved.
 */
export function BuilderActions({
  input,
  needsApproval,
  onFieldErrors,
}: {
  readonly input: QuotationInput | null;
  /** The discount is above the limit; approvers' own discounts are approved as they save. */
  readonly needsApproval: boolean;
  readonly onFieldErrors: (errors: Readonly<Record<string, string>>) => void;
}) {
  const t = useTranslations('quotations.builder.actions');
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canApprove = useCan('quotations.approve_discount');
  const waits = needsApproval && !canApprove;
  // Once saved, a retry must never create the quotation a second time.
  const savedId = useRef<string | null>(null);
  const save = useMutation({
    mutationFn: async ({ body, send }: { body: QuotationInput; send: boolean }) => {
      const created = await expectStatus(api.quotations.createQuotation({ body }), 201);
      savedId.current = created.id;
      if (!send || created.discountPendingApproval) {
        return { created, sent: false, sendError: null };
      }
      try {
        const sent = await expectStatus(
          api.quotations.sendQuotation({ params: { id: created.id } }),
          200,
        );
        return { created: sent, sent: true, sendError: null };
      } catch (caught) {
        return { created, sent: false, sendError: describeError(caught) };
      }
    },
    onSuccess: async ({ created, sent, sendError }) => {
      await queryClient.invalidateQueries({ queryKey: ['quotations'] });
      if (sendError) {
        // Saved but not sent: open the saved quotation, where sending can be tried again.
        toast({
          tone: 'error',
          title: t('sendFailed'),
          reference: created.number,
          description: sendError,
        });
      } else {
        toast({
          tone: 'success',
          title: sent ? t('sent') : t('saved'),
          reference: created.number,
          description: created.discountPendingApproval ? t('waitingApproval') : undefined,
        });
      }
      router.push(`/quotations/${created.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError) onFieldErrors(error.fieldErrors);
      toast({ tone: 'error', title: t('failed'), description: describeError(error) });
    },
  });
  const run = (send: boolean) => {
    if (!input || save.isPending) return;
    if (savedId.current) {
      router.push(`/quotations/${savedId.current}`);
      return;
    }
    onFieldErrors({});
    save.mutate({ body: input, send });
  };
  const sending = save.isPending && save.variables?.send === true;
  const saving = save.isPending && save.variables?.send === false;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          leadingIcon={<Save />}
          disabled={!input || save.isPending || save.isSuccess}
          pending={saving}
          onClick={() => run(false)}
        >
          {t('draft')}
        </Button>
        <Button
          variant="primary"
          leadingIcon={<Send />}
          disabled={!input || save.isPending || save.isSuccess}
          pending={sending}
          onClick={() => run(true)}
        >
          {waits ? t('saveForApproval') : t('send')}
        </Button>
      </div>
      <p className="type-label text-ink-faint">{waits ? t('approvalNote') : t('sendNote')}</p>
    </div>
  );
}
