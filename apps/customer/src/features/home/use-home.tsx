import type { CustomerProject } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useMemo, useState } from 'react';
import { api, keys } from '@/api/api';

/** Everything on Home, Payments and the quotation: one request, shared by the tabs. */
export function useHome() {
  return useQuery({ queryKey: keys.home, queryFn: () => unwrap(api.customer.home()) });
}

interface Choice {
  readonly chosenId: string | null;
  readonly choose: (id: string) => void;
}

const ChoiceContext = createContext<Choice>({ chosenId: null, choose: () => undefined });

/** Which home the customer is looking at, kept while they move between tabs. */
export function ProjectChoiceProvider({ children }: { readonly children: ReactNode }) {
  const [chosenId, choose] = useState<string | null>(null);
  const value = useMemo(() => ({ chosenId, choose }), [chosenId]);
  return <ChoiceContext value={value}>{children}</ChoiceContext>;
}

/** The chosen home (or the first), plus the way to switch. */
export function useChosenProject(projects: readonly CustomerProject[] | undefined) {
  const { chosenId, choose } = use(ChoiceContext);
  const project = projects?.find((item) => item.id === chosenId) ?? projects?.[0] ?? null;
  return { project, choose };
}
