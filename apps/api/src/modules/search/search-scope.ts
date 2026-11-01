import type { SearchType } from '@oneohm/api-contracts';
import type { Capability, RoleKind } from '@oneohm/domain';

/** Who is searching: what kind of account and what they may do. */
export interface Searcher {
  readonly userId: string;
  readonly kind: RoleKind;
  readonly capabilities: ReadonlySet<Capability>;
}

const has = (searcher: Searcher, ...capabilities: Capability[]) =>
  capabilities.some((capability) => searcher.capabilities.has(capability));

/**
 * Which kinds of record a person may search, by the same rights that open them. Some
 * kinds are narrowed further to the person's own (see `sees*Everything`).
 */
const RULES: Readonly<Record<SearchType, (searcher: Searcher) => boolean>> = {
  projects: (s) => has(s, 'projects.view_all'),
  customers: (s) => has(s, 'customers.view'),
  leads: (s) => has(s, 'leads.view_all', 'leads.view_own', 'leads.manage'),
  quotations: (s) => has(s, 'quotations.view', 'quotations.create'),
  tasks: (s) => has(s, 'tasks.view_assigned', 'tasks.approve', 'projects.view_all'),
  payments: (s) => has(s, 'finance.view', 'finance.record_payments'),
  service: (s) => s.kind === 'staff' && has(s, 'service.manage', 'customers.view'),
  documents: (s) => has(s, 'documents.view', 'documents.upload', 'documents.manage'),
  contractors: (s) => has(s, 'contractors.manage'),
  vendors: (s) =>
    has(s, 'inventory.view', 'inventory.manage', 'procurement.manage', 'dispatch.manage'),
};

/** The asked-for kinds this person may search, in the order results show. */
export function searchableTypes(searcher: Searcher, asked: readonly SearchType[]): SearchType[] {
  return (Object.keys(RULES) as SearchType[]).filter(
    (type) => asked.includes(type) && RULES[type](searcher),
  );
}

/** Staff who approve tasks or see every project find any task; everyone else only theirs. */
export const seesAllTasks = (searcher: Searcher) =>
  searcher.kind !== 'partner' && has(searcher, 'tasks.approve', 'projects.view_all');

/** Staff with `documents.view` find any file; others only files they added or on their tasks. */
export const seesAllDocuments = (searcher: Searcher) =>
  searcher.kind === 'staff' && has(searcher, 'documents.view');

/** Phone numbers show to people who may see customers, or on their own leads. */
export const seesCustomerPhones = (searcher: Searcher) => has(searcher, 'customers.view');
