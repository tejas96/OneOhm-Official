'use client';

import type { PurchaseOrderStatus } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export const INVENTORY_KEYS = {
  all: ['inventory'] as const,
  stock: ['inventory', 'stock'] as const,
  locations: ['inventory', 'locations'] as const,
  movements: ['inventory', 'movements'] as const,
  vendors: ['inventory', 'vendors'] as const,
  orders: (status?: PurchaseOrderStatus) => ['inventory', 'orders', status ?? 'all'] as const,
  order: (id: string) => ['inventory', 'order', id] as const,
  dispatches: ['inventory', 'dispatches'] as const,
  material: (projectId: string) => ['inventory', 'material', projectId] as const,
};

export function useStock() {
  return useQuery({
    queryKey: INVENTORY_KEYS.stock,
    queryFn: () => expectStatus(api.inventory.stock.list(), 200),
  });
}

export function useLocations() {
  return useQuery({
    queryKey: INVENTORY_KEYS.locations,
    queryFn: () => expectStatus(api.inventory.stock.locations(), 200),
    staleTime: 5 * 60_000,
  });
}

export function useMovements() {
  return useQuery({
    queryKey: INVENTORY_KEYS.movements,
    queryFn: () => expectStatus(api.inventory.stock.movements({ query: {} }), 200),
  });
}

export function useVendors() {
  return useQuery({
    queryKey: INVENTORY_KEYS.vendors,
    queryFn: () => expectStatus(api.inventory.vendors.list(), 200),
  });
}

export function useOrders(status?: PurchaseOrderStatus) {
  return useQuery({
    queryKey: INVENTORY_KEYS.orders(status),
    queryFn: () =>
      expectStatus(api.inventory.purchaseOrders.list({ query: status ? { status } : {} }), 200),
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: INVENTORY_KEYS.order(id ?? 'none'),
    queryFn: () =>
      expectStatus(api.inventory.purchaseOrders.get({ params: { id: id ?? '' } }), 200),
    enabled: id !== null,
  });
}

export function useDispatches() {
  return useQuery({
    queryKey: INVENTORY_KEYS.dispatches,
    queryFn: () => expectStatus(api.inventory.stock.dispatches(), 200),
  });
}

export function useProjectMaterial(projectId: string | null) {
  return useQuery({
    queryKey: INVENTORY_KEYS.material(projectId ?? 'none'),
    queryFn: () =>
      expectStatus(api.inventory.material.get({ params: { id: projectId ?? '' } }), 200),
    enabled: projectId !== null,
  });
}

/** After any stock change: every inventory view, the project room and the dashboard. */
export function useRefreshInventory() {
  const queryClient = useQueryClient();
  return useCallback(
    async (projectId?: string | null) => {
      await queryClient.invalidateQueries({ queryKey: INVENTORY_KEYS.all });
      if (projectId) await queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      await queryClient.invalidateQueries({ queryKey: ['command-center'] });
    },
    [queryClient],
  );
}

/** Quantities as people read them: up to 3 decimals, Indian grouping. */
export const formatQuantity = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
