import {
  CHANGE_REQUEST_CAPTURES,
  CHANGE_REQUEST_INPUT_KEYS,
  CHANGE_REQUEST_UPDATE_KEYS,
  DOCUMENT_CATEGORIES,
  EPC_STAGES,
} from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';
import { waitingPartySchema } from './project.schema';

/**
 * A DISCOM's own change requests and report formats (PRD 3.15, 3.18), built in
 * Settings → DISCOMs from named building blocks, never typed keys.
 */

const stepKeySchema = z.string().regex(/^[a-z][a-z0-9_]{0,59}$/);

export const changeRequestStepInputSchema = z.object({
  /** Kept from the step it was; left out for a new step (made from its title). */
  key: stepKeySchema.optional(),
  title: z.string().trim().max(120),
  roleKey: z.string().trim().min(1).max(60),
  durationDays: z.number().int().min(0).max(365),
  waitingParty: waitingPartySchema,
  captures: z.array(z.enum(CHANGE_REQUEST_CAPTURES)).max(CHANGE_REQUEST_CAPTURES.length),
});

export const changeRequestTypeInputSchema = z.object({
  title: z.string().trim().max(80),
  description: z.string().trim().max(200).default(''),
  fields: z
    .array(z.object({ key: z.enum(CHANGE_REQUEST_INPUT_KEYS), required: z.boolean() }))
    .max(CHANGE_REQUEST_INPUT_KEYS.length),
  documents: z.array(z.enum(DOCUMENT_CATEGORIES)).max(DOCUMENT_CATEGORIES.length),
  steps: z.array(changeRequestStepInputSchema).max(12),
  blocks: z.object({
    stages: z.array(z.enum(EPC_STAGES)).max(EPC_STAGES.length),
    taskKeys: z.array(z.string().trim().max(80)).max(30),
  }),
  updates: z.array(z.enum(CHANGE_REQUEST_UPDATE_KEYS)).max(CHANGE_REQUEST_UPDATE_KEYS.length),
  active: z.boolean(),
});
export type ChangeRequestTypeInput = z.infer<typeof changeRequestTypeInputSchema>;

/** One DISCOM's change-request type as Settings shows it. */
export const changeRequestTypeSettingSchema = changeRequestTypeInputSchema.extend({
  id: idSchema,
  discomId: idSchema,
  key: z.string(),
  steps: z.array(changeRequestStepInputSchema.extend({ key: stepKeySchema })),
  /** Requests of this type still open, which keep the steps they started with. */
  openRequests: z.number().int(),
  /** One of OneOhm's starting six (the system suggests these). */
  builtIn: z.boolean(),
  updatedAt: instantSchema,
});
export type ChangeRequestTypeSetting = z.infer<typeof changeRequestTypeSettingSchema>;

/** A change the raise form offers for one site, with only its own fields. */
export const changeRequestOptionSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  fields: z.array(
    z.object({
      key: z.enum(CHANGE_REQUEST_INPUT_KEYS),
      kind: z.enum(['text', 'kw', 'select']),
      options: z.array(z.string()).optional(),
      required: z.boolean(),
    }),
  ),
  /** The papers it needs, and whether each is already on file for this customer or site. */
  documents: z.array(z.object({ category: z.enum(DOCUMENT_CATEGORIES), onFile: z.boolean() })),
  steps: z.number().int(),
  holdsProjectWork: z.boolean(),
});
export type ChangeRequestOption = z.infer<typeof changeRequestOptionSchema>;

export const changeRequestOptionsSchema = z.object({
  /** The DISCOM whose changes are offered; null until one is picked. */
  discom: z.object({ id: idSchema, code: z.string(), name: z.string() }).nullable(),
  /** The site has no DISCOM of its own: the form asks which (it is then saved on the site). */
  askDiscom: z.boolean(),
  options: z.array(changeRequestOptionSchema),
});
export type ChangeRequestOptions = z.infer<typeof changeRequestOptionsSchema>;

/** A report format's key, as used in URLs (e.g. `wcr`, `net-metering-agreement`). */
export const reportFormatKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,59}$/);

export const reportFormatInputSchema = z.object({
  name: z.string().trim().min(3).max(120),
  /** The Handlebars (HTML) body; checked against the details OneOhm records. */
  body: z.string().min(20).max(400_000),
  onlyWithSubsidy: z.boolean(),
  customerVisible: z.boolean(),
  active: z.boolean(),
});
export type ReportFormatInput = z.infer<typeof reportFormatInputSchema>;

const requirementSchema = z.object({ field: z.string(), label: z.string() });

/** One DISCOM's report format as Settings shows it. */
export const reportFormatSchema = reportFormatInputSchema.omit({ body: true }).extend({
  id: idSchema,
  discomId: idSchema,
  key: z.string(),
  /** Still OneOhm's own file, or one the owner uploaded. */
  source: z.enum(['built_in', 'uploaded']),
  /** Details it prints, read from the template, which a project must have. */
  requires: z.array(requirementSchema),
  /** The tasks that make it (Settings → Task templates); none means at project set-up. */
  triggers: z.array(z.string()),
  updatedAt: instantSchema,
});
export type ReportFormat = z.infer<typeof reportFormatSchema>;

/** What a template body needs, and what it prints with sample details filled in. */
export const reportFormatCheckSchema = z.object({
  requires: z.array(requirementSchema),
  /** Present only when the body is acceptable. */
  html: z.string().nullable(),
});
export type ReportFormatCheck = z.infer<typeof reportFormatCheckSchema>;
