/** Copy for a reseller's own customers and commission (PRD 4.8). */
type Event = 'project_created' | 'advance_paid' | 'commissioned';
type CommissionState = 'upcoming' | 'pending' | 'approved' | 'paid' | 'rejected';

const EVENT_WORDS: Readonly<Record<Event, string>> = {
  project_created: 'when the project is booked',
  advance_paid: 'when the customer pays the advance',
  commissioned: 'when the system is commissioned',
};

export const RESELLER_CUSTOMERS = {
  title: 'My clients',
  subtitle: (people: number, projects: number) =>
    `${people} ${people === 1 ? 'person' : 'people'} · ${projects} ${projects === 1 ? 'project' : 'projects'}`,
  search: 'Search name, city or project',
  filterLabel: 'Show',
  filters: { all: 'All', leads: 'Leads', projects: 'Projects', done: 'Installed' },
  loading: 'Loading your customers',
  emptyTitle: 'No clients yet',
  emptyBody: 'People you register as leads appear here, and follow their project once it starts.',
  noProject: 'Not a project yet',
  project: (code: string, kw: string) => `${code} · ${kw} kW`,
  stage: (stage: string) => `Now: ${stage}`,
  progress: (percent: number) => `${percent}% done`,
  progressLabel: (name: string, percent: number) => `${name}: ${percent}% of the work done`,
  installed: 'Installed',
  cancelled: 'Cancelled',
  commission: (amount: string) => `Commission ${amount}`,
} as const;

export const COMMISSION_STATE: Readonly<Record<CommissionState, string>> = {
  upcoming: 'Expected',
  pending: 'Waiting for approval',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Not approved',
};

export const EARNINGS = {
  title: 'Earnings',
  loading: 'Loading your commission',
  ruleTitle: 'How you earn',
  rule: (amount: string, event: Event) => `${amount} ${EVENT_WORDS[event]}.`,
  percentOfValue: (percent: string) => `${percent}% of the project value`,
  perKw: (amount: string) => `${amount} for every kW installed`,
  ruleOff: 'Commission is not set up yet. Your contact will share the terms.',
  ruleNote: 'Each commission is approved before it is paid.',
  tiles: {
    earned: 'Earned',
    pending: 'Waiting for approval',
    approved: 'Approved, to be paid',
    paid: 'Paid to you',
    upcoming: 'Expected on open projects',
  },
  historyTitle: 'Statement',
  historyEmpty: 'Commission you earn shows here, project by project, with each payment.',
  earnedOn: (date: string) => `Earned ${date}`,
  paidOn: (date: string, method: string) => `Paid ${date} · ${method}`,
  reference: (reference: string) => `Ref ${reference}`,
  rejected: (reason: string) => `Not approved: ${reason}`,
  methods: { cash: 'Cash', cheque: 'Cheque', bank_transfer: 'Bank transfer', upi: 'UPI' },
  basisPercent: (percent: string, value: string) => `${percent}% of ${value}`,
  basisPerKw: (amount: string, kw: string) => `${amount}/kW × ${kw} kW`,
  payoutBanner: 'Add payout details to get paid',
  payoutBannerHint: 'Opens your payout details',
} as const;

/** Where a reseller's commission is paid: UPI or a bank account, plus PAN. */
export const PAYOUT = {
  title: 'Payout details',
  empty: 'Tell us where to send your commission. It takes a minute.',
  add: 'Add payout details',
  change: 'Change',
  sheetDescription: 'We pay your commission here. Only our finance team sees the full details.',
  methodLabel: 'How you get paid',
  methods: { upi: 'UPI', bank: 'Bank account' },
  upiId: 'UPI ID',
  upiHint: 'For example name@okaxis',
  bankAccountName: 'Name on account',
  bankAccountNumber: 'Account number',
  bankIfsc: 'IFSC',
  ifscHint: 'On your cheque book or passbook',
  pan: 'PAN',
  panHint: 'Needed for tax on your commission',
  keepHint: 'Leave blank to keep the saved one',
  save: 'Save',
  saved: 'Payout details saved',
  missing: {
    upiId: 'Enter your UPI ID',
    bankAccountName: 'Enter the name on the account',
    bankAccountNumber: 'Enter the account number',
    bankIfsc: 'Enter the IFSC',
    pan: 'Enter your PAN',
  },
} as const;
