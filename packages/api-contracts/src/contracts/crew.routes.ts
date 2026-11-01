import { initContract } from '@ts-rest/core';
import { crewFeedbackSchema, crewPaymentsSchema } from '../schemas/crew.schema';

const c = initContract();

/**
 * The crew's own money and feedback (PRD 4.9), part of the contractors contract. Only
 * crew members (partner role, on a contractor) can call these.
 */
export const crewRoutes = c.router({
  crewPayments: {
    method: 'GET',
    path: '/crew/payments',
    responses: { 200: crewPaymentsSchema },
    summary: "Payables for the crew's contractor: awaiting approval, approved and paid.",
  },
  crewFeedback: {
    method: 'GET',
    path: '/crew/feedback',
    responses: { 200: crewFeedbackSchema },
    summary: 'Customer ratings and rework on the contractor’s jobs.',
  },
});
