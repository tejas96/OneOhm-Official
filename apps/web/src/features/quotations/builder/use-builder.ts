'use client';

import type { Property } from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import {
  type BuilderState,
  EMPTY_BUILDER,
  fromQuotation,
  suggestInverter,
  suggestPanel,
  toInput,
  withProperty,
} from './builder-state';
import { useProperty } from './property-summary';
import type { Catalog } from './system-fields';

/** Panels, inverters and batteries on sale, fetched once for the builder. */
export function useCatalog() {
  return useQuery({
    queryKey: ['catalog', 'quotation-products'],
    queryFn: async (): Promise<Catalog> => {
      const products = await expectStatus(api.catalog.listProducts({ query: {} }), 200);
      const active = products.filter((product) => product.active);
      return {
        panels: active.filter((product) => product.category === 'panel'),
        inverters: active.filter((product) => product.category === 'inverter'),
        batteries: active.filter((product) => product.category === 'battery'),
      };
    },
    staleTime: 5 * 60_000,
  });
}

/**
 * The builder's form state. It starts from the link it was opened with: `?propertyId=`
 * (from a customer), `?leadId=` (from a lead) or `?from=` (revising a quotation), and
 * suggests a panel and inverter until sales picks one by hand.
 */
export function useBuilder() {
  const params = useSearchParams();
  const fromId = params.get('from');
  const leadId = params.get('leadId');
  const [state, setState] = useState<BuilderState>(() => ({
    ...EMPTY_BUILDER,
    propertyId: params.get('propertyId'),
    leadId,
  }));
  const patch = useCallback(
    (next: Partial<BuilderState>) => setState((current) => ({ ...current, ...next })),
    [],
  );
  const applied = useRef<{ property?: string | undefined; revision?: boolean; lead?: boolean }>({});

  const catalog = useCatalog();
  const property = useProperty(state.propertyId);
  const revision = useQuery({
    queryKey: ['quotation', fromId],
    queryFn: () => expectStatus(api.quotations.getQuotation({ params: { id: fromId ?? '' } }), 200),
    enabled: fromId !== null,
  });
  const lead = useQuery({
    queryKey: ['lead', leadId],
    queryFn: () => expectStatus(api.crm.getLead({ params: { id: leadId ?? '' } }), 200),
    enabled: leadId !== null && fromId === null,
  });

  useEffect(() => {
    if (!revision.data || applied.current.revision) return;
    applied.current = {
      ...applied.current,
      revision: true,
      property: revision.data.input.propertyId,
    };
    setState(fromQuotation(revision.data));
  }, [revision.data]);

  useEffect(() => {
    const site = property.data;
    if (!site || applied.current.property === site.id) return;
    applied.current = { ...applied.current, property: site.id };
    setState((current) => withProperty(current, site));
  }, [property.data]);

  useEffect(() => {
    const found = lead.data;
    if (!found || applied.current.lead) return;
    applied.current = { ...applied.current, lead: true };
    setState((current) => ({
      ...current,
      propertyId: current.propertyId ?? found.propertyId,
      subsidyCategory: found.subsidyCategory,
      targetKw: current.targetKw || (found.estimatedWp ? String(found.estimatedWp / 1000) : ''),
    }));
  }, [lead.data]);

  const products = catalog.data;
  useEffect(() => {
    if (!products || state.panelChosen) return;
    const suggested = suggestPanel(products.panels, state.subsidyCategory);
    if (suggested !== state.panelProductId) patch({ panelProductId: suggested });
  }, [products, state.panelChosen, state.subsidyCategory, state.panelProductId, patch]);

  useEffect(() => {
    if (!products || state.inverterChosen) return;
    const suggested = suggestInverter(products.inverters, state.targetKw, state.systemType);
    if (suggested !== state.inverterProductId) patch({ inverterProductId: suggested });
  }, [
    products,
    state.inverterChosen,
    state.targetKw,
    state.systemType,
    state.inverterProductId,
    patch,
  ]);

  const selectProperty = useCallback((site: Property) => {
    applied.current = { ...applied.current, property: site.id };
    setState((current) => withProperty(current, site));
  }, []);
  const clearProperty = useCallback(() => {
    applied.current = { ...applied.current, property: undefined };
    patch({ propertyId: null });
  }, [patch]);

  // The distance from base follows the site's GPS until someone types it (PRD 3.9 B).
  const distance = useQuery({
    queryKey: ['site-distance', state.propertyId],
    queryFn: () =>
      expectStatus(api.quotations.siteDistance({ params: { id: state.propertyId ?? '' } }), 200),
    enabled: state.propertyId !== null,
    staleTime: 5 * 60_000,
  });
  const gpsKm = distance.data?.distanceKm ?? null;
  useEffect(() => {
    if (gpsKm === null || state.distanceTouched) return;
    if (state.distanceKm !== String(gpsKm)) patch({ distanceKm: String(gpsKm) });
  }, [gpsKm, state.distanceTouched, state.distanceKm, patch]);

  const input = useMemo(() => toInput(state), [state]);
  return {
    distance: distance.data,
    state,
    patch,
    input,
    catalog,
    revision: revision.data,
    selectProperty,
    clearProperty,
  };
}
