import type { LeadStage } from '../epc/stages';

/** The steps of a sale we tell Meta and Google about, in order. */
export const CONVERSION_EVENTS = ['survey', 'quoted', 'advance_paid', 'won'] as const;
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number];

/** How Meta knows the person: a WhatsApp ad click, its own lead form, or a web click (fbc). */
export type MetaMatch = 'ctwa' | 'lead_form' | 'web';

/**
 * Meta event names. WhatsApp ad chats use Meta's business-messaging events; lead-form leads
 * use the stage names (Meta's CRM conversion leads); web clicks use the standard events.
 */
export const META_EVENT_NAME: Readonly<Record<MetaMatch, Record<ConversionEvent, string>>> = {
  ctwa: {
    survey: 'QualifiedLead',
    quoted: 'InitiateCheckout',
    advance_paid: 'OrderCreated',
    won: 'Purchase',
  },
  lead_form: {
    survey: 'Survey booked',
    quoted: 'Quoted',
    advance_paid: 'Advance paid',
    won: 'Won',
  },
  web: {
    survey: 'Schedule',
    quoted: 'InitiateCheckout',
    advance_paid: 'AddPaymentInfo',
    won: 'Purchase',
  },
};

/** The Google conversion action made for each step when Google is connected. */
export const GOOGLE_CONVERSION: Readonly<
  Record<ConversionEvent, { readonly name: string; readonly category: string }>
> = {
  survey: { name: 'OneOhm · Survey booked', category: 'QUALIFIED_LEAD' },
  quoted: { name: 'OneOhm · Quoted', category: 'QUALIFIED_LEAD' },
  advance_paid: { name: 'OneOhm · Advance paid', category: 'CONVERTED_LEAD' },
  won: { name: 'OneOhm · Won', category: 'PURCHASE' },
};

/** What a lead has reached, from its stage and whether its advance is paid. */
export function reachedEvents(
  stage: LeadStage,
  facts: {
    readonly surveyBooked: boolean;
    readonly quoteSent: boolean;
    readonly advancePaid: boolean;
    readonly won: boolean;
  },
): ConversionEvent[] {
  const won = facts.won || stage === 'won';
  const advance = facts.advancePaid;
  // A later step means the earlier ones happened, even when nobody logged them.
  const quoted = won || advance || facts.quoteSent || stage === 'quoted';
  const survey = quoted || facts.surveyBooked || stage === 'survey_scheduled';
  const reached: Record<ConversionEvent, boolean> = {
    survey,
    quoted,
    advance_paid: advance,
    won,
  };
  return CONVERSION_EVENTS.filter((event) => reached[event]);
}
