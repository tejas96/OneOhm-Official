import { distanceMeters, type GeoPoint } from '../workforce/attendance';

/** What the team can send a customer from the "Send to customer" menu (redesign §18). */
export const SEND_ACTIONS = [
  'ask_paper',
  'ask_location',
  'send_document',
  'payment_reminder',
  'send_receipt',
  'ask_payment_proof',
  'share_crew',
  'delay_notice',
  'ask_callback',
] as const;
export type SendAction = (typeof SEND_ACTIONS)[number];

/** Where the button is pressed; the menu only lists what fits there. */
export interface SendPlace {
  /** The customer is known (a lead without a site has none: nothing can be sent). */
  readonly customer: boolean;
  readonly project: boolean;
  readonly lead: boolean;
  /** A task of a project, which brings the project with it. */
  readonly task: boolean;
}

/**
 * The actions that fit a place, in menu order. Project-only actions (papers, crew, delay
 * notices) are hidden on a lead; customer-level ones show everywhere. Payments need a
 * project that can owe, so a lead has none.
 */
export function sendActionsFor(place: SendPlace): SendAction[] {
  if (!place.customer) return [];
  const withProject = place.project || place.task;
  const onlyLead = place.lead && !withProject;
  const shown: Record<SendAction, boolean> = {
    ask_paper: withProject || place.lead,
    ask_location: true,
    send_document: true,
    payment_reminder: !onlyLead,
    send_receipt: !onlyLead,
    ask_payment_proof: !onlyLead,
    share_crew: withProject,
    delay_notice: place.task,
    ask_callback: true,
  };
  return SEND_ACTIONS.filter((action) => shown[action]);
}

/** Any one of these rights lets a person send the action (the existing documents/customers/projects rights). */
const RIGHTS: Readonly<Record<SendAction, readonly string[]>> = {
  ask_paper: ['documents.upload', 'documents.manage'],
  send_document: ['documents.upload', 'documents.manage'],
  ask_location: ['customers.manage', 'projects.manage'],
  ask_callback: ['customers.manage', 'leads.manage', 'projects.manage'],
  payment_reminder: ['finance.record_payments', 'projects.manage'],
  send_receipt: ['finance.record_payments', 'projects.manage'],
  ask_payment_proof: ['finance.record_payments', 'projects.manage'],
  share_crew: ['projects.manage'],
  delay_notice: ['projects.manage'],
};

export const rightsFor = (action: SendAction): readonly string[] => RIGHTS[action];

/**
 * The rights that let a person cancel or check an ask of this type: the same as sending it. A paper
 * is the documents rights; location, payment and call-back asks follow their send action.
 */
export function rightsForAsk(type: string): readonly string[] {
  switch (type) {
    case 'location':
      return RIGHTS.ask_location;
    case 'pay':
      return RIGHTS.payment_reminder;
    case 'callback':
      return RIGHTS.ask_callback;
    default:
      return RIGHTS.ask_paper;
  }
}

/** The times of day a customer can pick for a call. */
export const CALLBACK_SLOTS = ['morning', 'afternoon', 'evening'] as const;
export type CallbackSlot = (typeof CALLBACK_SLOTS)[number];

/**
 * What a customer's pin does to a home (redesign §6): a home with no location takes it; one
 * that has a point (a surveyor's GPS, a map pin) keeps it and the pin becomes a suggestion for
 * the team to check; the same spot (within a metre) changes nothing.
 */
export function pinDecision(current: GeoPoint | null, pin: GeoPoint): 'save' | 'suggest' | 'same' {
  if (current === null) return 'save';
  return distanceMeters(current, pin) < 1 ? 'same' : 'suggest';
}

/** When each time of day starts for a call (the business clock, "HH:MM"). */
export const CALLBACK_TIMES: Readonly<Record<CallbackSlot, string>> = {
  morning: '10:00',
  afternoon: '14:00',
  evening: '17:30',
};

/**
 * The follow-up time for a picked slot: the slot's start today, or tomorrow when the clock
 * ("HH:MM", business time) has already reached it.
 */
export function callbackWhen(
  slot: CallbackSlot,
  clock: string,
): { readonly time: string; readonly nextDay: boolean } {
  const time = CALLBACK_TIMES[slot];
  return { time, nextDay: clock >= time };
}
