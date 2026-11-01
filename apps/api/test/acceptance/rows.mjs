// PRD section 13, one row per acceptance requirement, and the scenario file that proves it.
export const ROWS = [
  [
    '01-quotation-speed',
    'Quotation speed',
    'Price, subsidy, effective cost and PDF shared in minutes without a survey',
  ],
  [
    '02-subsidy',
    'Subsidy',
    'Individual, housing society and commercial; ₹0 with a reason for non-DCR',
  ],
  [
    '03-quote-accuracy',
    'Quote accuracy',
    'Survey variance within tolerance absorbed; beyond it a revision for approval',
  ],
  [
    '04-project-creation',
    'Project creation',
    'Conditional tasks and assignments without manual assignment',
  ],
  ['05-discom', 'DISCOM', 'A DISCOM adds its tasks; DISCOM waiting reported separately'],
  [
    '06-loan',
    'Loan handling',
    'Loan tasks and bank receivable only with a loan; disbursements reconcile',
  ],
  [
    '07-contractors',
    'Contractors',
    'Work order, evidence, payable, deductions, payment; own data only',
  ],
  [
    '08-task-communication',
    'Task communication',
    'A configured task queues the right WhatsApp message',
  ],
  [
    '09-task-completion',
    'Task completion',
    'Evidence and approvals enforced; uploads retry (unit tests)',
  ],
  [
    '10-final-payment',
    'Final payment',
    'Final receivable once at commissioning; net meter closes operationally',
  ],
  ['11-costing', 'Costing', 'Cable, structure, labour, travel and contractor costs traceable'],
  ['12-documents', 'Documents', 'Find, download, select and print project documents'],
  ['13-leave', 'Leave', 'Project impact and handover before ordinary leave approval'],
  ['14-engagement', 'Engagement', 'Points reflect verified performance'],
  ['15-customer-app', 'Customer app', 'Progress, subsidy status, pay, documents, service request'],
  ['16-reseller', 'Reseller app', 'Only their own leads, projects, commission and payments'],
  ['17-finance', 'Finance', 'Every collection and payout recorded and reconciled'],
  [
    '18-owner-dashboard',
    'Owner dashboard',
    'Major risks and delay causes without opening every project',
  ],
  ['19-ux', 'UX', 'New users complete common workflows without training (manual)'],
].map(([key, area, requirement]) => ({ key, area, requirement }));

/** Rows that cannot be automated, with where their checklist lives. */
export const MANUAL = { '19-ux': 'docs/UX-ACCEPTANCE-CHECKLIST.md' };
