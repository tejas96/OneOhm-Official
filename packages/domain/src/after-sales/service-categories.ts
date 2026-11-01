/**
 * The kinds of service request OneOhm ships with (PRD 7.2). Owners rename them, change
 * their hours and add their own in Settings; the keys never change once used.
 */
export interface ServiceCategoryDefault {
  readonly key: string;
  /** What the office reads. */
  readonly label: string;
  /** What the customer picks in the app, in plain words. */
  readonly customerLabel: string;
  readonly responseHours: number;
  readonly resolutionHours: number;
  /** Made by OneOhm itself (maintenance visits); customers cannot pick it. */
  readonly system?: boolean;
}

/** Preventive maintenance visits from an AMC are service requests of this category. */
export const MAINTENANCE_VISIT_CATEGORY = 'maintenance_visit';

export const SERVICE_CATEGORY_KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

export const DEFAULT_SERVICE_CATEGORIES: readonly ServiceCategoryDefault[] = [
  {
    key: 'no_generation',
    label: 'No generation',
    customerLabel: 'No electricity from solar',
    responseHours: 4,
    resolutionHours: 48,
  },
  {
    key: 'low_generation',
    label: 'Low generation',
    customerLabel: 'Less electricity than usual',
    responseHours: 24,
    resolutionHours: 120,
  },
  {
    key: 'inverter_error',
    label: 'Inverter error',
    customerLabel: 'Inverter error or alarm',
    responseHours: 8,
    resolutionHours: 72,
  },
  {
    key: 'physical_damage',
    label: 'Physical damage',
    customerLabel: 'Damage to panels or wiring',
    responseHours: 8,
    resolutionHours: 72,
  },
  {
    key: 'cleaning',
    label: 'Panel cleaning',
    customerLabel: 'Panel cleaning',
    responseHours: 24,
    resolutionHours: 168,
  },
  {
    key: 'billing_net_meter',
    label: 'Billing or net meter',
    customerLabel: 'Electricity bill or net meter',
    responseHours: 24,
    resolutionHours: 168,
  },
  {
    key: 'subsidy',
    label: 'Subsidy',
    customerLabel: 'Subsidy question',
    responseHours: 24,
    resolutionHours: 240,
  },
  {
    key: 'other',
    label: 'Something else',
    customerLabel: 'Something else',
    responseHours: 24,
    resolutionHours: 120,
  },
  {
    key: MAINTENANCE_VISIT_CATEGORY,
    label: 'Maintenance visit',
    customerLabel: 'Maintenance visit',
    // Confirm the visit with the customer within two days; finish it on the day.
    responseHours: 48,
    resolutionHours: 24,
    system: true,
  },
];

/** A key for a new category from its name: "Meter shifting" → meter_shifting. */
export function categoryKeyFrom(label: string): string {
  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(key) ? key : `c_${key}`.slice(0, 40);
}
