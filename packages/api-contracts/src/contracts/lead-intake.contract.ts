import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema, nameSchema, phoneSchema } from '../common/primitives';

const c = initContract();

/** What the office learns about a phone number before adding a lead (PRD 3.3). */
export const phoneMatchSchema = z.object({
  /** An open lead already has this number. */
  openLead: z.object({ id: idSchema, name: z.string() }).nullable(),
  /** A customer already has this number (only for people who see customers). */
  customer: z.object({ id: idSchema, name: z.string() }).nullable(),
});
export type PhoneMatch = z.infer<typeof phoneMatchSchema>;

/** The website's enquiry form; strict, because anyone on the internet can send it. */
export const websiteLeadInputSchema = z.object({
  name: nameSchema.max(80),
  phone: phoneSchema,
  city: z.string().trim().min(2, 'Enter your town or city.').max(80),
  message: z.string().trim().max(1000).nullable().optional(),
  /** The page the form was on, e.g. /rooftop-solar. */
  sourcePage: z.string().trim().max(300).nullable().optional(),
  /** Hidden from people; a filled value means a bot, and nothing is saved. */
  website: z.string().max(200).optional(),
});
export type WebsiteLeadInput = z.infer<typeof websiteLeadInputSchema>;

/** Someone who can own leads: active staff whose role manages leads. */
export const leadOwnerSchema = z.object({
  id: idSchema,
  fullName: z.string(),
  openLeads: z.number().int(),
  onLeave: z.boolean(),
});
export type LeadOwner = z.infer<typeof leadOwnerSchema>;

export const leadIntakeContract = c.router({
  leadOwners: {
    method: 'GET',
    path: '/lead-owners',
    responses: { 200: z.array(leadOwnerSchema) },
    summary: 'People a lead can be given to, with how many open leads each has.',
  },
  matchPhone: {
    method: 'GET',
    path: '/lead-match',
    query: z.object({ phone: phoneSchema }),
    responses: { 200: phoneMatchSchema },
    summary: 'Open lead or customer already on this number, shown while a lead is typed.',
  },
  websiteLead: {
    method: 'POST',
    path: '/public/leads',
    body: websiteLeadInputSchema,
    responses: { 202: z.object({ received: z.literal(true) }) },
    summary:
      'Website enquiry form (no sign-in). Rate limited per address and per phone; an open lead with the same phone is reused.',
  },
});
