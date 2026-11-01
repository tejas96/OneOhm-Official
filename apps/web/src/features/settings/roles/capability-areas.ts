import { CAPABILITIES, type Capability } from '@oneohm/domain';

/** Areas in the order an EPC business works; message keys under `settings.areas`. */
export const CAPABILITY_AREAS = [
  'dashboard',
  'sales',
  'delivery',
  'liaisoning',
  'materials',
  'finance',
  'field',
  'documents',
  'people',
  'partners',
  'admin',
] as const;
export type CapabilityArea = (typeof CAPABILITY_AREAS)[number];

const AREA_OF_PREFIX: Readonly<Record<string, CapabilityArea>> = {
  dashboard: 'dashboard',
  leads: 'sales',
  customers: 'sales',
  surveys: 'sales',
  quotations: 'sales',
  projects: 'delivery',
  tasks: 'delivery',
  loans: 'liaisoning',
  discom: 'liaisoning',
  subsidy: 'liaisoning',
  inventory: 'materials',
  procurement: 'materials',
  dispatch: 'materials',
  finance: 'finance',
  contractors: 'field',
  service: 'field',
  documents: 'documents',
  reports: 'documents',
  people: 'people',
  leave: 'people',
  attendance: 'people',
  commission: 'partners',
  work_orders: 'partners',
  settings: 'admin',
  roles: 'admin',
  audit: 'admin',
};

export interface CapabilityGroup {
  readonly area: CapabilityArea;
  readonly capabilities: readonly Capability[];
}

/** Every capability, grouped by area; a capability with an unknown prefix lands in admin. */
export const CAPABILITY_GROUPS: readonly CapabilityGroup[] = CAPABILITY_AREAS.map((area) => ({
  area,
  capabilities: CAPABILITIES.filter(
    (capability) => (AREA_OF_PREFIX[capability.split('.')[0] ?? ''] ?? 'admin') === area,
  ),
})).filter((group) => group.capabilities.length > 0);
