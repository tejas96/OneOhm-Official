import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';
import { useCan, useCurrentUser } from '@/session/session-provider';

/** Query keys for the crew screens; recording usage refreshes `material`. */
export const CREW_KEYS = {
  all: ['crew'] as const,
  orders: ['crew', 'work-orders'] as const,
  order: (id: string) => ['crew', 'work-order', id] as const,
  material: ['crew', 'material'] as const,
  payments: ['crew', 'payments'] as const,
  feedback: ['crew', 'feedback'] as const,
};

/** A contractor crew member: a partner-kind person who can see their work orders. */
export function useIsCrew(): boolean {
  const user = useCurrentUser();
  const sees = useCan('work_orders.view_own');
  return user.kind === 'partner' && sees;
}

export function useCrewOrders(enabled = true) {
  return useQuery({
    queryKey: CREW_KEYS.orders,
    queryFn: () => unwrap(api.contractors.listWorkOrders({ query: {} })),
    enabled,
  });
}

export function useCrewOrder(id: string) {
  return useQuery({
    queryKey: CREW_KEYS.order(id),
    queryFn: () => unwrap(api.contractors.getWorkOrder({ params: { id } })),
    retry: false,
  });
}

export function useCrewMaterial(enabled = true) {
  return useQuery({
    queryKey: CREW_KEYS.material,
    queryFn: () => unwrap(api.inventory.custody.crewMaterial()),
    enabled,
  });
}

export function useCrewPayments(enabled = true) {
  return useQuery({
    queryKey: CREW_KEYS.payments,
    queryFn: () => unwrap(api.contractors.crewPayments()),
    enabled,
  });
}

export function useCrewFeedback(enabled = true) {
  return useQuery({
    queryKey: CREW_KEYS.feedback,
    queryFn: () => unwrap(api.contractors.crewFeedback()),
    enabled,
  });
}

/** Quantities as people read them: up to 3 decimals, Indian grouping. */
export const formatQuantity = (value: number) =>
  value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
