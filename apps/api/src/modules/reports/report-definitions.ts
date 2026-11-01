import type { ReportKey } from '@oneohm/api-contracts';

/**
 * The six statutory reports (PRD 3.18). Each lists the project facts it needs; facts are
 * captured once by tasks and reused. A report whose condition fails reads "Not needed".
 */
export interface ReportDefinition {
  readonly key: ReportKey;
  readonly name: string;
  readonly required: readonly string[];
  /** Company profile fields the report needs (signatory details for undertakings). */
  readonly company?: readonly ('signatoryName' | 'signatoryPhone' | 'signatoryEmail')[];
  readonly onlyWithSubsidy?: boolean;
  readonly discomCodes?: readonly string[];
  /** Visible to the customer in their app once generated. */
  readonly customerVisible: boolean;
}

const MSEDCL = ['MSEDCL'];

export const REPORT_DEFINITIONS: readonly ReportDefinition[] = [
  {
    key: 'model-agreement',
    name: 'Model Agreement',
    required: [
      'project_onboarded_date',
      'consumer_name',
      'consumer_number',
      'site_address',
      'module_total_kw',
      'module_make',
      'module_wattage',
      'inverter_total_kw',
      'system_cost',
    ],
    customerVisible: true,
  },
  {
    key: 'net-metering-agreement',
    name: 'Net Metering Agreement',
    required: ['consumer_name', 'consumer_number', 'site_address', 'installed_capacity_kw'],
    discomCodes: MSEDCL,
    customerVisible: true,
  },
  {
    key: 'wcr',
    name: 'Work Completion Report',
    required: [
      'consumer_name',
      'consumer_number',
      'site_address',
      'sanction_number',
      'sanctioned_capacity_kw',
      'installed_capacity_kw',
      'module_make',
      'module_wattage',
      'module_count',
      'module_total_kw',
      'inverter_make',
      'inverter_total_kw',
    ],
    customerVisible: true,
  },
  {
    key: 'dcr',
    name: 'DCR Undertaking',
    required: [
      'installed_capacity_kw',
      'consumer_name',
      'site_address',
      'sanction_number',
      'sanction_date',
      'module_wattage',
      'module_count',
      'module_serial_numbers',
      'module_make',
      'purchase_order_number',
      'purchase_order_date',
      'cell_manufacturer_name',
      'cell_gst_invoice_no',
    ],
    company: ['signatoryName', 'signatoryPhone', 'signatoryEmail'],
    onlyWithSubsidy: true,
    customerVisible: false,
  },
  {
    key: 'annexure-proforma-a',
    name: 'Annexure-I & Proforma-A',
    required: [
      'consumer_name',
      'consumer_number',
      'consumer_phone',
      'site_address',
      'sanctioned_capacity_kw',
      'installed_capacity_kw',
      'inverter_total_kw',
      'inverter_make',
      'module_count',
      'module_total_kw',
      'site_city',
      'site_state',
    ],
    discomCodes: MSEDCL,
    customerVisible: true,
  },
  {
    key: 'meter-test-letter',
    name: 'Meter Test Covering Letter',
    required: [
      'consumer_name',
      'consumer_number',
      'sanction_number',
      'sanction_date',
      'meter_serial_number',
      'meter_make',
      'meter_capacity',
    ],
    discomCodes: MSEDCL,
    customerVisible: false,
  },
];

export const COMPANY_FIELD_LABELS = {
  signatoryName: 'Signatory name (Settings → Company)',
  signatoryPhone: 'Signatory phone (Settings → Company)',
  signatoryEmail: 'Signatory email (Settings → Company)',
} as const;
