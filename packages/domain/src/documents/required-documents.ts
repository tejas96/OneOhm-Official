import type { ProjectType } from '../epc/stages';
import type { DocumentCategory } from './document-categories';

export interface RequirementContext {
  readonly type: ProjectType;
  readonly loan: boolean;
  readonly subsidy: boolean;
  readonly nameChange: boolean;
}

/** One paper a project needs; any file in one of `categories` satisfies it. */
export interface DocumentRequirement {
  readonly key: string;
  readonly label: string;
  readonly categories: readonly DocumentCategory[];
  /** Why it is needed, shown under the name. */
  readonly why: string;
  /** Only the customer holds it, so the team may ask them for it (PRD 5.4). */
  readonly fromCustomer?: boolean;
  /** A paper older than this many days stops counting (redesign 5.4); none means it never does. */
  readonly maxAgeDays?: number | null;
}

const ALWAYS: readonly DocumentRequirement[] = [
  {
    key: 'kyc',
    label: 'Customer ID proof (Aadhaar or PAN)',
    categories: ['customer_kyc'],
    why: 'DISCOM application and subsidy registration.',
    fromCustomer: true,
  },
  {
    key: 'bill',
    label: 'Latest electricity bill',
    categories: ['electricity_bill'],
    why: 'Consumer number and sanctioned load.',
    fromCustomer: true,
    maxAgeDays: 90,
  },
  {
    key: 'property',
    label: 'Property proof (tax receipt, 7/12 or index II)',
    categories: ['property'],
    why: 'Shows the customer may install on this roof.',
    fromCustomer: true,
  },
  {
    key: 'survey',
    label: 'Site survey photos and notes',
    categories: ['site_survey', 'site_photo'],
    why: 'Design and costing from what is on site.',
  },
  {
    key: 'quotation',
    label: 'Accepted quotation',
    categories: ['quotation'],
    why: 'The agreed price and system.',
  },
  {
    key: 'net_metering',
    label: 'Net-metering application papers',
    categories: ['discom'],
    why: 'Submitted to the DISCOM for the net meter.',
  },
  {
    key: 'handover',
    label: 'Commissioning and handover papers',
    categories: ['commissioning_handover'],
    why: 'Proof the system was handed over working.',
  },
  {
    key: 'warranty',
    label: 'Warranty cards (panels and inverter)',
    categories: ['warranty'],
    why: 'Given to the customer at handover.',
  },
];

/**
 * The papers a project needs (PRD 3.14), by project type, loan, subsidy and name change.
 * Statutory reports are listed separately from their own definitions.
 */
export function requiredDocuments(project: RequirementContext): DocumentRequirement[] {
  const extra: DocumentRequirement[] = [];
  if (project.type === 'society')
    extra.push({
      key: 'society',
      label: 'Society NOC and resolution',
      categories: ['property'],
      why: 'The society agrees to the common-roof installation.',
      fromCustomer: true,
    });
  if (project.loan)
    extra.push({
      key: 'loan',
      label: 'Bank loan papers (sanction letter, agreement)',
      categories: ['bank_loan'],
      why: 'Needed to claim the bank disbursement.',
      fromCustomer: true,
    });
  if (project.subsidy)
    extra.push({
      key: 'subsidy_bank',
      label: 'Bank passbook or cancelled cheque',
      categories: ['subsidy'],
      why: 'The government pays the subsidy into this account.',
      fromCustomer: true,
    });
  if (project.nameChange)
    extra.push({
      key: 'name_change',
      label: 'Name change papers',
      categories: ['discom'],
      why: 'The DISCOM must show the customer as the consumer.',
      fromCustomer: true,
    });
  return [...ALWAYS.slice(0, 5), ...extra, ...ALWAYS.slice(5)];
}
