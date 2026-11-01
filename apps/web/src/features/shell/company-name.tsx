'use client';

import { useCompany } from '@/features/settings/use-settings';

/**
 * The company's name from its profile (PRD Appendix A: never hard-coded). Nothing shows
 * until it loads, so a renamed company never flashes the old name.
 */
export function useCompanyName(): string {
  const company = useCompany();
  return company.data?.legalName ?? '';
}
