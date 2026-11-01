export const TODAY = {
  greeting: {
    morning: 'Good morning',
    midday: 'Good afternoon',
    evening: 'Good evening',
    night: 'Good evening',
  },
  summary: (open: number, overdue: number) =>
    open === 0
      ? 'Nothing assigned to you right now.'
      : `${open} open ${open === 1 ? 'task' : 'tasks'}${overdue > 0 ? `, ${overdue} overdue` : ''}.`,
  dayCard: 'Your work',
  onTime: 'On time',
  onTimeAria: (percent: number) => `${percent}% of your open tasks are on time`,
  counts: { overdue: 'Overdue', today: 'Today', upcoming: 'Coming up' },
  quick: { newLead: 'New lead', quote: 'Quick quote' },
  groups: {
    overdue: 'Overdue',
    today: 'Due today',
    upcoming: 'Coming up',
    waiting: 'Waiting on others',
    review: 'Sent for approval',
  },
  emptyTitle: 'A clear day',
  emptyBody: 'New work appears here as soon as it is assigned to you.',
  loading: 'Loading your tasks',
} as const;

export const TASK = {
  status: {
    pending: 'Not started',
    ready: 'Ready to start',
    in_progress: 'In progress',
    waiting: 'Waiting',
    in_review: 'Sent for approval',
    completed: 'Done',
  },
  due: (label: string) => `Due ${label}`,
  overdueBy: (days: number) => `${days} ${days === 1 ? 'day' : 'days'} overdue`,
  dueToday: 'Due today',
  waitingOn: (party: string) => `Waiting on ${party}`,
  stage: 'Stage',
  dueDate: 'Due',
  project: 'Project',
  blockedTitle: 'Finish these first',
  blockedBody: 'This task starts when the work before it is done.',
  captureTitle: 'What to record',
  captureBody:
    'Fill in what you found on site. Details already recorded on the project can stay empty.',
  noCaptures: 'Nothing to record for this task. Add a note if it helps the next person.',
  note: 'Note',
  notePlaceholder: 'What happened, what is next',
  evidenceTitle: 'Photos and documents',
  evidenceKinds: {
    photo: 'Site photos',
    document: 'Documents',
    measurement: 'Measurements',
    checklist: 'Checklist',
    signature: 'Customer signature',
  },
  evidencePending:
    'Photo and document upload arrives with the documents update. Until then, attach them from the office.',
  approvalNote: 'A manager approves this task after you complete it.',
  start: 'Start task',
  resume: 'Resume',
  complete: 'Complete task',
  sendForApproval: 'Send for approval',
  approve: 'Approve',
  markWaiting: 'Waiting on someone',
  waitingSheet: {
    title: 'Who is this waiting on?',
    description:
      'Time waiting on customers, banks and DISCOM is reported separately from the team.',
    party: 'Waiting on',
    note: 'What are you waiting for?',
    notePlaceholder: 'e.g. Customer to share the latest electricity bill',
    save: 'Mark as waiting',
  },
  done: {
    completed: 'Task completed',
    review: 'Sent for approval',
    started: 'Task started',
    waiting: 'Marked as waiting',
    approved: 'Approved',
  },
  notFound: 'This task is no longer on your list. It may be done or reassigned.',
} as const;

/**
 * Plain names for the facts tasks record. Mirrors the API's labels so the form
 * reads the same as its error messages.
 */
export const FACT_LABELS: Readonly<Record<string, string>> = {
  site_floors: 'Number of floors',
  structure_type: 'Structure type',
  dc_cable_meters: 'DC cable length (m)',
  ac_cable_meters: 'AC cable length (m)',
  consumer_number: 'Consumer number',
  sanctioned_capacity_kw: 'Sanctioned load (kW)',
  meter_holder_name: 'Meter holder name',
  sanction_number: 'DISCOM sanction number',
  sanction_date: 'DISCOM sanction date',
  purchase_order_number: 'Purchase order number',
  purchase_order_date: 'Purchase order date',
  module_make: 'Panel make',
  module_wattage: 'Panel wattage (Wp)',
  cell_manufacturer_name: 'Cell manufacturer',
  cell_gst_invoice_no: 'Cell GST invoice number',
  module_serial_numbers: 'Panel serial numbers',
  module_count: 'Number of panels',
  inverter_make: 'Inverter make',
  inverter_serial_number: 'Inverter serial number',
  earthing_resistance: 'Earthing resistance (Ω)',
  meter_serial_number: 'Generation meter serial number',
  meter_make: 'Meter make',
  meter_capacity: 'Meter capacity',
  installed_capacity_kw: 'Installed capacity (kW)',
  inverter_total_kw: 'Inverter capacity (kW)',
  module_total_kw: 'Module capacity (kW)',
  consumer_name: 'Consumer name',
  consumer_phone: 'Consumer mobile',
  consumer_email: 'Consumer email',
  site_address: 'Site address',
  site_city: 'District',
  site_state: 'State',
  system_cost: 'System cost',
  project_onboarded_date: 'Onboarding date',
  module_model_number: 'Panel model number',
  module_efficiency: 'Panel efficiency (%)',
  inverter_make_model: 'Inverter make and model',
};

export function factLabel(key: string): string {
  return (
    FACT_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase())
  );
}
