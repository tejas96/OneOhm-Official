import { CAPABILITIES, type Capability, type RoleKind } from './capabilities';

export interface RoleDefinition {
  readonly key: string;
  readonly name: string;
  readonly kind: RoleKind;
  readonly description: string;
  readonly capabilities: readonly Capability[];
  /** System roles cannot be deleted or lose permissions (Super Admin). */
  readonly system?: boolean;
}

const EVERYONE: readonly Capability[] = [
  'tasks.view_assigned',
  'tasks.complete',
  'leave.request',
  'attendance.mark',
  'documents.view',
  'documents.download',
  'documents.print',
];

const ADMIN: readonly Capability[] = CAPABILITIES.filter(
  // Paying out money and editing roles stay with the Super Admin unless delegated.
  (capability) => capability !== 'finance.approve_payments' && capability !== 'roles.manage',
);

/** OneOhm's roles on day one. Owners add, rename or archive roles in Settings. */
export const DEFAULT_ROLES: readonly RoleDefinition[] = [
  {
    key: 'marketing',
    name: 'Marketing',
    kind: 'staff',
    description: 'Lead capture, campaigns and referral programmes.',
    capabilities: [...EVERYONE, 'leads.view_all', 'leads.manage', 'customers.view'],
  },
  {
    key: 'sales',
    name: 'Sales',
    kind: 'staff',
    description: 'Leads, follow-ups, site surveys and quotations.',
    capabilities: [
      ...EVERYONE,
      'leads.view_all',
      'leads.manage',
      'customers.view',
      'customers.manage',
      'surveys.perform',
      'quotations.view',
      'quotations.create',
      'documents.upload',
    ],
  },
  {
    key: 'reseller',
    name: 'Reseller / Promoter',
    kind: 'reseller',
    description: 'Their own leads, authorised quotations and commission.',
    capabilities: ['leads.view_own', 'leads.manage', 'quotations.create', 'commission.view_own'],
  },
  {
    key: 'loan',
    name: 'Loan',
    kind: 'staff',
    description: 'Lending partners, loan documents, bank submission and disbursements.',
    capabilities: [
      ...EVERYONE,
      'customers.view',
      'projects.view_all',
      'loans.manage',
      'finance.view',
      'documents.upload',
    ],
  },
  {
    key: 'liaisoning',
    name: 'Liaisoning',
    kind: 'staff',
    description: 'DISCOM applications, net metering, subsidy portal and utility changes.',
    capabilities: [
      ...EVERYONE,
      'customers.view',
      'projects.view_all',
      'discom.manage',
      'subsidy.manage',
      'documents.upload',
      'documents.manage',
      'reports.generate',
    ],
  },
  {
    key: 'ic_partner',
    name: 'I&C partner',
    kind: 'partner',
    description: 'Installation and commissioning crews: their own tasks, work orders and payables.',
    capabilities: [
      'tasks.view_assigned',
      'tasks.complete',
      'work_orders.view_own',
      'documents.view',
    ],
  },
  {
    key: 'execution',
    name: 'Execution',
    kind: 'staff',
    description: 'Projects, surveys, site work and team assignment.',
    capabilities: [
      ...EVERYONE,
      'customers.view',
      'surveys.perform',
      'projects.view_all',
      'projects.manage',
      'tasks.assign',
      'tasks.approve',
      'inventory.view',
      'contractors.manage',
      'reports.generate',
      'documents.upload',
      'documents.manage',
    ],
  },
  {
    key: 'store',
    name: 'Store',
    kind: 'staff',
    description: 'Stock, material issue and returns, project reservations.',
    capabilities: [...EVERYONE, 'inventory.view', 'inventory.manage', 'projects.view_all'],
  },
  {
    key: 'accounts',
    name: 'Accounts',
    kind: 'staff',
    description: 'Payments, receipts, invoices, ledger and reconciliation.',
    capabilities: [
      ...EVERYONE,
      'customers.view',
      'projects.view_all',
      'finance.view',
      'finance.record_payments',
      'quotations.view',
    ],
  },
  {
    key: 'procurement',
    name: 'Procurement',
    kind: 'staff',
    description: 'Purchase requests and orders, vendors.',
    capabilities: [...EVERYONE, 'inventory.view', 'procurement.manage', 'projects.view_all'],
  },
  {
    key: 'service',
    name: 'Service',
    kind: 'staff',
    description: 'Service tickets, AMC and warranty.',
    capabilities: [
      ...EVERYONE,
      'customers.view',
      'projects.view_all',
      'service.manage',
      'documents.upload',
    ],
  },
  {
    key: 'dispatch',
    name: 'Dispatch',
    kind: 'staff',
    description: 'Delivering material to sites.',
    capabilities: [...EVERYONE, 'inventory.view', 'dispatch.manage', 'projects.view_all'],
  },
  {
    key: 'hr',
    name: 'HR',
    kind: 'staff',
    description: 'Employees, attendance, leave and rewards.',
    capabilities: [...EVERYONE, 'people.view', 'people.manage', 'leave.approve'],
  },
  {
    key: 'admin',
    name: 'Admin',
    kind: 'staff',
    description: 'Settings, users, templates and day-to-day administration.',
    capabilities: ADMIN,
  },
  {
    key: 'super_admin',
    name: 'Super Admin',
    kind: 'staff',
    description: 'Everything, including roles and approving payouts.',
    capabilities: CAPABILITIES,
    system: true,
  },
];

export const SUPER_ADMIN_ROLE_KEY = 'super_admin';
