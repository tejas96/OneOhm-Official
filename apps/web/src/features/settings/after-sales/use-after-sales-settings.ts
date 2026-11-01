'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';

export const AFTER_SALES_KEYS = {
  categories: ['settings', 'service-categories'],
  warranty: ['settings', 'warranty'],
  plans: ['settings', 'amc-plans'],
} as const;

export function useCategories() {
  return useQuery({
    queryKey: AFTER_SALES_KEYS.categories,
    queryFn: () => expectStatus(api.afterSales.listServiceCategories(), 200),
  });
}

export function useWarranty() {
  return useQuery({
    queryKey: AFTER_SALES_KEYS.warranty,
    queryFn: () => expectStatus(api.afterSales.warrantyPolicy(), 200),
  });
}

export function useAmcPlans(enabled = true) {
  return useQuery({
    queryKey: AFTER_SALES_KEYS.plans,
    queryFn: () => expectStatus(api.afterSales.listAmcPlans(), 200),
    enabled,
  });
}

/** "4 hours", or "2 days" once it is whole days. */
export function useHours() {
  const t = useTranslations('afterSales');
  return (hours: number) =>
    hours >= 48 && hours % 24 === 0
      ? t('days', { count: hours / 24 })
      : t('hours', { count: hours });
}
