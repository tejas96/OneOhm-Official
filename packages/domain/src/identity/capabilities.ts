/**
 * What the system can check. Fixed in code; roles (stored as data, editable in
 * Settings) are named bundles of these.
 */
export const CAPABILITIES = [
  'dashboard.view_business',
  'leads.view_all',
  'leads.view_own',
  'leads.manage',
  'customers.view',
  'customers.manage',
  'surveys.perform',
  'quotations.view',
  'quotations.create',
  'quotations.approve_discount',
  'projects.view_all',
  'projects.create',
  'projects.manage',
  'tasks.view_assigned',
  'tasks.assign',
  'tasks.complete',
  'tasks.approve',
  'loans.manage',
  'discom.manage',
  'subsidy.manage',
  'inventory.view',
  'inventory.manage',
  'procurement.manage',
  'dispatch.manage',
  'finance.view',
  'finance.record_payments',
  'finance.approve_payments',
  'contractors.manage',
  'service.manage',
  'documents.view',
  'documents.upload',
  'documents.download',
  'documents.print',
  'documents.manage',
  'reports.generate',
  'people.view',
  'people.manage',
  'leave.request',
  'leave.approve',
  'attendance.mark',
  'commission.view_own',
  'work_orders.view_own',
  'settings.manage',
  'roles.manage',
  'audit.view',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Who a role is for. It decides the app and the data a person can see:
 * staff see company data by permission; partners (I&C crews) and resellers see
 * only their own work; customers use the customer app.
 */
export const ROLE_KINDS = ['staff', 'partner', 'reseller'] as const;
export type RoleKind = (typeof ROLE_KINDS)[number];
