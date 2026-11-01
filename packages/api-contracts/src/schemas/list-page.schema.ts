import {
  LEAD_STAGES,
  PROJECT_FINISH_FILTERS,
  PROJECT_HEALTH_FILTERS,
  PROJECT_SORTS,
  PROJECT_STATUS_FILTERS,
  PROJECT_TYPE_FILTERS,
} from '@oneohm/domain';
import { z } from 'zod';
import { pageOf, pageQuerySchema } from '../common/paging';
import { calendarDateSchema, idSchema } from '../common/primitives';
import { customerSchema, leadSchema } from './crm.schema';
import { receivedPaymentSchema } from './finance.schema';
import { projectSummarySchema } from './project.schema';
import { quotationSummarySchema } from './quotation.schema';
import {
  SERVICE_KINDS,
  SERVICE_STATUSES,
  SLA_FILTERS,
  serviceTicketSchema,
} from './service-desk.schema';

/** Words to find; short enough to stay a search, not a document. */
const searchSchema = z.string().trim().max(80).optional();

/**
 * The project list, filtered and ordered on the server (the same values the screen
 * keeps in its URL: `?health=attention`, `?finish=behind`, `?manager=…`).
 */
export const projectPageQuerySchema = pageQuerySchema.extend({
  q: searchSchema,
  status: z.enum(PROJECT_STATUS_FILTERS).default('live'),
  health: z.enum(PROJECT_HEALTH_FILTERS).default('any'),
  type: z.enum(PROJECT_TYPE_FILTERS).default('all'),
  sort: z.enum(PROJECT_SORTS).default('due'),
  manager: idSchema.optional(),
  finish: z.enum(PROJECT_FINISH_FILTERS).default('any'),
  since: calendarDateSchema.optional(),
});
export type ProjectPageQuery = z.infer<typeof projectPageQuerySchema>;

export const projectPageSchema = pageOf(projectSummarySchema).extend({
  /** The size of every matching project, not only this page. */
  capacityWp: z.number().int().nonnegative(),
  /** The name of the manager asked for, for the filter chip; null when none was. */
  managerName: z.string().nullable(),
});
export type ProjectPage = z.infer<typeof projectPageSchema>;

export const LEAD_LIST_FILTERS = ['open', 'due', 'unowned', ...LEAD_STAGES, 'all'] as const;
export type LeadListFilter = (typeof LEAD_LIST_FILTERS)[number];

export const leadPageQuerySchema = pageQuerySchema.extend({
  filter: z.enum(LEAD_LIST_FILTERS).default('open'),
  q: searchSchema,
});

export const leadPageSchema = pageOf(leadSchema).extend({
  /** Of the matching leads: follow-ups already late, and due today. */
  overdue: z.number().int().nonnegative(),
  dueToday: z.number().int().nonnegative(),
});
export type LeadPage = z.infer<typeof leadPageSchema>;

export const customerPageQuerySchema = pageQuerySchema.extend({ q: searchSchema });
export const customerPageSchema = pageOf(customerSchema);
export type CustomerPage = z.infer<typeof customerPageSchema>;

export const QUOTATION_LIST_FILTERS = [
  'all',
  'draft',
  'sent',
  'accepted',
  'rejected',
  'approval',
] as const;
export type QuotationListFilter = (typeof QUOTATION_LIST_FILTERS)[number];

export const quotationPageQuerySchema = pageQuerySchema.extend({
  filter: z.enum(QUOTATION_LIST_FILTERS).default('all'),
  q: searchSchema,
});
export const quotationPageSchema = pageOf(quotationSummarySchema).extend({
  /** Open quotations whose discount waits for an approver, whatever the filter. */
  waitingApproval: z.number().int().nonnegative(),
});
export type QuotationPage = z.infer<typeof quotationPageSchema>;

export const servicePageQuerySchema = pageQuerySchema.extend({
  status: z.enum(SERVICE_STATUSES).optional(),
  sla: z.enum(SLA_FILTERS).optional(),
  kind: z.enum(SERVICE_KINDS).optional(),
  /** One request by id (a link from an alert), whatever page it sits on. */
  id: idSchema.optional(),
});
export const servicePageSchema = pageOf(serviceTicketSchema);
export type ServicePage = z.infer<typeof servicePageSchema>;

export const paymentPageQuerySchema = pageQuerySchema;
export const paymentPageSchema = pageOf(receivedPaymentSchema);
export type PaymentPage = z.infer<typeof paymentPageSchema>;
