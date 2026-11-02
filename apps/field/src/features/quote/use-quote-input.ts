import type { QuotationPreviewInput } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { quoteFormChecks, whole } from './quote-checks';
import type { QuoteForm } from './quote-inputs';
import {
  type InverterRow,
  inverterPicksOf,
  parseKw,
  type QuoteSite,
  rupeesToPaise,
  suggestInverterRows,
  useDebounced,
} from './quote-options';

/** The pricing request, once the site and every number pricing needs are filled in. */
export function buildQuoteInput(
  site: QuoteSite | null,
  form: QuoteForm,
  panelId: string | null,
  inverterRows: readonly InverterRow[],
): QuotationPreviewInput | null {
  const inverters = inverterPicksOf(inverterRows);
  const targetWp = parseKw(form.sizeKw);
  const floors = whole(form.floors);
  const distanceKm = whole(form.distanceKm);
  if (!site || !targetWp || !panelId || !inverters || floors === null || distanceKm === null) {
    return null;
  }
  // Out of range: no request until it is fixed; the inputs say what to change.
  if (Object.keys(quoteFormChecks(form, site.subsidyCategory === 'society')).length > 0) {
    return null;
  }
  return {
    propertyId: site.propertyId,
    leadId: site.leadId,
    subsidyCategory: site.subsidyCategory,
    households: site.subsidyCategory === 'society' ? whole(form.households) : null,
    systemType: 'on_grid',
    targetWp,
    panelProductId: panelId,
    inverters,
    batteryProductId: null,
    structureType: form.structure,
    floors,
    distanceKm,
    discountPaise: rupeesToPaise(form.discount),
    extras: [...form.extras],
  };
}

/** Catalog choices plus the live preview, debounced so typing never floods the API. */
export function useQuotePreview(site: QuoteSite | null, form: QuoteForm) {
  const products = useQuery({
    queryKey: keys.products,
    queryFn: () => unwrap(api.catalog.listProducts({ query: {} })),
  });
  const all = products.data ?? [];
  const panels = all.filter((product) => product.category === 'panel' && product.active);
  const inverters = all.filter((product) => product.category === 'inverter' && product.active);
  const targetWp = parseKw(form.sizeKw);
  const suggested = targetWp ? suggestInverterRows(inverters, targetWp) : [];
  const panelId = form.panelId ?? panels.find((panel) => panel.dcr === form.dcr)?.id ?? null;
  const inverterRows = form.inverters ?? suggested;
  const input = buildQuoteInput(site, form, panelId, inverterRows);
  const settled = useDebounced(input);
  const preview = useQuery({
    queryKey: ['quote-preview', settled],
    queryFn: () =>
      unwrap(api.quotations.previewQuotation({ body: settled as QuotationPreviewInput })),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return {
    panels,
    inverters,
    inverterRows,
    panelId,
    input,
    ready: input !== null,
    preview,
  };
}
