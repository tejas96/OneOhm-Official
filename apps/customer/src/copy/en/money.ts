export const PAYMENTS = {
  payNow: (amount: string) => `Pay ${amount} now`,
  payHint: 'UPI, cards or net banking, through Razorpay.',
  payFailed: 'The payment page could not open. Please try again, or call your OneOhm contact.',
  /** Price minus the expected subsidy, in one plain line (PRD 5.3). */
  effectiveCost: (price: string, subsidy: string, effective: string) =>
    `${price} price − ${subsidy} expected subsidy = ${effective} your effective cost`,
  title: 'Payments',
  loading: 'Loading your payments',
  paidOf: (paid: string, total: string) => `${paid} paid of ${total}`,
  progressLabel: (percent: number) => `${percent}% of the project price paid`,
  remaining: 'Still to pay',
  allPaid: 'Everything is paid. Thank you!',
  scheduleTitle: 'Payment schedule',
  yourShare: 'Paid by you',
  bankShare: 'Paid by your bank (loan)',
  /** The bank's share once due: the customer has nothing to pay (PRD 3.11, 5.3). */
  waitingForBank: 'Waiting for bank disbursement',
  status: {
    upcoming: 'Not due yet',
    due: 'Due now',
    partly_paid: 'Part paid',
    paid: 'Paid',
  },
  paidSoFar: (amount: string) => `${amount} received`,
  dueOn: (date: string) => `Due ${date}`,
  howToPayTitle: 'How to pay',
  howToPayBody:
    'Your OneOhm contact will share payment details. Always confirm the account with them before you pay.',
  callContact: (name: string) => `Call ${name}`,
  subsidyNote: (amount: string) =>
    `The expected government subsidy of ${amount} is paid by the government straight to your bank account; it is not part of these payments.`,
  noProject: 'Payments appear here once your project starts.',
  /** A payment step by its plan key; English keeps the plan's own wording. */
  milestone: (_key: string, label: string) => label,
} as const;

/** Invoice, receipts and refunds on the Payments screen (PRD 5.3). */
export const BILLING = {
  title: 'Invoice and receipts',
  loading: 'Loading your invoice and receipts',
  invoice: (total: string) => `Tax invoice · ${total}`,
  invoiceMeta: (number: string, date: string) => `${number} · ${date}`,
  noInvoice: 'Your GST tax invoice for the full project price will appear here once it is issued.',
  receipt: (amount: string) => `Receipt · ${amount}`,
  receiptMeta: (number: string, date: string, purpose: string | null) =>
    [number, date, purpose].filter(Boolean).join(' · '),
  reversed: 'Cancelled',
  refundsTitle: 'Refunds to you',
  refund: (amount: string) => `${amount} refunded`,
  refundMeta: (date: string, method: string) => `${date} · ${method}`,
  refundMethod: {
    bank_transfer: 'Bank transfer',
    upi: 'UPI',
    razorpay: 'Back to your card or UPI',
    cheque: 'Cheque',
    cash: 'Cash',
  },
  credit: (amount: string) =>
    `${amount} you paid above what was due is held for you. OneOhm will set it against your next payment or refund it.`,
} as const;

export const DOCUMENTS = {
  title: 'Documents',
  loading: 'Loading your documents',
  quotationTitle: 'Your quotation',
  quotationBody: (number: string) => `Quotation ${number} with price, subsidy and effective cost.`,
  invoiceTitle: 'Your tax invoice',
  invoiceBody: (date: string, project: string | null) =>
    [project, 'GST tax invoice', date].filter(Boolean).join(' · '),
  reportsTitle: 'Agreements and reports',
  reportsEmpty: 'Agreements and completion reports appear here when they are ready.',
  filesTitle: 'Your papers',
  filesEmpty:
    'Bills, warranty cards, product manuals and handover papers that OneOhm shares will appear here.',
  open: 'Open',
  opening: 'Opening',
  openFailed: 'This file could not open. Please try again.',
  requestsTitle: 'OneOhm needs from you',
  requestsIntro: 'Send a clear photo or a PDF. It goes straight to your project file.',
  requestMeta: (project: string | null, kind: string) =>
    [kind, project].filter(Boolean).join(' · '),
  takePhoto: 'Camera',
  choosePhoto: 'Photos',
  chooseFile: 'PDF',
  sending: 'Sending',
  sent: (title: string) => `${title} sent. Thank you.`,
  sentOn: (date: string) => `Sent ${date}`,
  cameraDenied: 'Allow camera access in your phone settings to take a photo.',
  libraryDenied: 'Allow photo access in your phone settings to choose a photo.',
  sendFailed: 'This file could not be sent. Please try again.',
  category: {
    site_survey: 'Site visit report',
    customer_kyc: 'ID document',
    electricity_bill: 'Electricity bill',
    property: 'Property paper',
    quotation: 'Quotation',
    invoice_receipt: 'Invoice or receipt',
    bank_loan: 'Bank loan',
    discom: 'Electricity board',
    subsidy: 'Subsidy',
    commissioning_handover: 'Handover',
    warranty: 'Warranty',
    product_manual: 'Product manual',
    statutory_report: 'Report',
    site_photo: 'Site photo',
    other: 'Document',
  },
  /** Statutory report names by key; English keeps OneOhm's own name for each. */
  report: (_key: string, name: string) => name,
  size: (kb: number) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, kb)} KB`),
} as const;
