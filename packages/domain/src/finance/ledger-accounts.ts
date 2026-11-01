/**
 * OneOhm's chart of accounts for the double-entry ledger (PRD 3.11). Codes are fixed
 * in code so automatic postings always land in the same place; names are what
 * finance reads. The subsidy is never revenue or a receivable, so it has no account.
 */
export const LEDGER_ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type LedgerAccountType = (typeof LEDGER_ACCOUNT_TYPES)[number];

export interface LedgerAccount {
  readonly code: string;
  readonly name: string;
  readonly type: LedgerAccountType;
}

export const LEDGER_ACCOUNTS = [
  { code: '1000', name: 'Bank account', type: 'asset' },
  { code: '1010', name: 'Cash in hand', type: 'asset' },
  { code: '1020', name: 'Payment gateway clearing', type: 'asset' },
  { code: '1100', name: 'Customer receivables', type: 'asset' },
  { code: '1110', name: 'Bank loan receivables', type: 'asset' },
  { code: '2000', name: 'Vendor payables', type: 'liability' },
  { code: '2010', name: 'Contractor payables', type: 'liability' },
  { code: '2100', name: 'Advances received', type: 'liability' },
  { code: '2200', name: 'GST output', type: 'liability' },
  { code: '2300', name: 'TDS payable', type: 'liability' },
  { code: '3000', name: "Owner's capital", type: 'equity' },
  { code: '4000', name: 'Project revenue', type: 'income' },
  { code: '5000', name: 'Material cost', type: 'expense' },
  { code: '5010', name: 'Installation and labour cost', type: 'expense' },
  { code: '5020', name: 'Payment gateway fees', type: 'expense' },
] as const satisfies readonly LedgerAccount[];

export type LedgerAccountCode = (typeof LEDGER_ACCOUNTS)[number]['code'];

export const ACCOUNT = {
  bank: '1000',
  cash: '1010',
  gateway: '1020',
  customerReceivables: '1100',
  bankLoanReceivables: '1110',
  vendorPayables: '2000',
  contractorPayables: '2010',
  advancesReceived: '2100',
  gstOutput: '2200',
  tdsPayable: '2300',
  capital: '3000',
  revenue: '4000',
  materialCost: '5000',
  installationCost: '5010',
  gatewayFees: '5020',
} as const satisfies Record<string, LedgerAccountCode>;

/** Assets and expenses grow with debits; liabilities, equity and income with credits. */
export function debitNormal(type: LedgerAccountType): boolean {
  return type === 'asset' || type === 'expense';
}
