import type { QuotationPreviewInput } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import type { QuoteForm } from './quote-inputs';
import {
  parseKw,
  type QuoteSite,
  rupeesToPaise,
  suggestInverter,
  useDebounced,
} from './quote-options';

function whole(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** The pricing request, once the site and every number pricing needs are filled in. */
export function buildQuoteInput(
  site: QuoteSite | null,
  form: QuoteForm,
  panelId: string | null,
  inverterId: string | null,
): QuotationPreviewInput | null {
  const targetWp = parseKw(form.sizeKw);
  const floors = whole(form.floors);
  const distanceKm = whole(form.distanceKm);
  if (!site || !targetWp || !panelId || !inverterId || floors === null || distanceKm === null) {
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
    inverterProductId: inverterId,
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
  const suggested = targetWp ? suggestInverter(inverters, targetWp) : null;
  const panelId = form.panelId ?? panels.find((panel) => panel.dcr === form.dcr)?.id ?? null;
  const input = buildQuoteInput(site, form, panelId, form.inverterId ?? suggested?.id ?? null);
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
    suggestedInverterId: suggested?.id ?? null,
    input,
    ready: input !== null,
    preview,
  };
}
