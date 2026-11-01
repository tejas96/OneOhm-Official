import type { QuotationDetail, QuotationInput, QuotationPreviewInput } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { QUOTE } from '@/copy/quote';

/** What can be saved: only a quote for a site on record (a property) becomes a quotation. */
export function toQuotationInput(input: QuotationPreviewInput | null): QuotationInput | null {
  if (!input?.propertyId) return null;
  const { meterInSocietyName: _meter, subsidyClaimed: _claimed, ...rest } = input;
  return { ...rest, propertyId: input.propertyId };
}

const quotationKey = (id: string | null) => ['quotation', id] as const;

/**
 * Save the quick quote as a quotation (the same create the office uses: a new
 * revision when the site already has an open one) and send it to the customer. A
 * discount above the limit is saved and waits for an approver on the web app.
 */
export function useSaveQuote(input: QuotationInput | null) {
  const client = useQueryClient();
  const toast = useToast();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const saved = useQuery({
    queryKey: quotationKey(savedId),
    queryFn: () => unwrap(api.quotations.getQuotation({ params: { id: savedId ?? '' } })),
    enabled: savedId !== null,
  });
  const remember = (quotation: QuotationDetail) =>
    client.setQueryData(quotationKey(quotation.id), quotation);

  const save = useMutation({
    mutationFn: (body: QuotationInput) => unwrap(api.quotations.createQuotation({ body })),
    onSuccess: (created, body) => {
      remember(created);
      setSavedId(created.id);
      setSavedFor(JSON.stringify(body));
      toast(QUOTE.save.savedToast(created.number));
      void client.invalidateQueries({ queryKey: keys.leads });
    },
  });
  const send = useMutation({
    mutationFn: (id: string) => unwrap(api.quotations.sendQuotation({ params: { id } })),
    onSuccess: (updated) => {
      remember(updated);
      toast(QUOTE.save.sentToast(updated.customer.name));
      void client.invalidateQueries({ queryKey: keys.leads });
    },
  });

  const quotation = saved.data ?? null;
  const changed = quotation !== null && input !== null && JSON.stringify(input) !== savedFor;
  return {
    quotation,
    /** The form no longer matches what was saved: saving again makes a new revision. */
    changed,
    /** The saved quote's discount is approved (or needed none) and the form still matches. */
    approved: quotation !== null && !changed && !quotation.discountPendingApproval,
    refresh: () => void saved.refetch(),
    refreshing: saved.isFetching,
    save,
    send,
  };
}

export type SaveQuote = ReturnType<typeof useSaveQuote>;
