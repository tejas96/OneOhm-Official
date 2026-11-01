'use client';

import type { QuotationInput } from '@oneohm/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';
import { useDebouncedValue } from '../use-debounced-value';

/**
 * The live price (PRD 3.5 step 3: instantly). Asks the API once typing pauses and
 * keeps the last price on screen, dimmed, while the next one is calculated.
 */
export function useQuotationPreview(input: QuotationInput | null) {
  const settled = useDebouncedValue(input, 350);
  const query = useQuery({
    queryKey: ['quotation-preview', settled],
    queryFn: () =>
      expectStatus(api.quotations.previewQuotation({ body: settled as QuotationInput }), 200),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 30_000,
  });
  const error = input && query.isError ? query.error : null;
  return {
    preview: input ? query.data : undefined,
    updating: input !== null && (input !== settled || query.isFetching),
    error,
    fieldErrors: error instanceof ApiError ? error.fieldErrors : {},
  };
}
