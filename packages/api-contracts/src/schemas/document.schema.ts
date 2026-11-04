import { COMPANY_ASSET_KINDS, DOCUMENT_CATEGORIES, TASK_EVIDENCE_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';
import { geotagFieldsSchema, photoGeotagSchema } from './site-activity.schema';

export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export const companyAssetKindSchema = z.enum(COMPANY_ASSET_KINDS);
export const documentSourceSchema = z.enum(['upload', 'system', 'report']);

/** A file on a task, shown as a thumbnail or chip where the task is shown. */
export const attachmentSchema = z.object({
  id: idSchema,
  name: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().int(),
  createdAt: instantSchema,
});
export type Attachment = z.infer<typeof attachmentSchema>;

/** The current file of a document; replaced and removed files stay in the audit trail. */
export const documentSchema = attachmentSchema.extend({
  category: z.string(),
  source: documentSourceSchema,
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  taskId: idSchema.nullable(),
  taskTitle: z.string().nullable(),
  customerId: idSchema.nullable(),
  propertyId: idSchema.nullable(),
  reportKey: z.string().nullable(),
  /** Filed while the customer was a lead, or kept on a vendor or contractor (PRD 3.14). */
  leadId: idSchema.nullable().optional(),
  vendorId: idSchema.nullable().optional(),
  contractorId: idSchema.nullable().optional(),
  uploadedBy: userRefSchema.nullable(),
  /** True when this file replaced an earlier one (the earlier file is not shown). */
  replaced: z.boolean(),
  /** Where and when a field photo was taken, when it was recorded (PRD 4.2). */
  geotag: photoGeotagSchema.nullable().optional(),
});
export type DocumentRecord = z.infer<typeof documentSchema>;

export const documentFilterSchema = z
  .object({
    projectId: idSchema.optional(),
    taskId: idSchema.optional(),
    customerId: idSchema.optional(),
    /**
     * The papers kept on the lead's customer and site (not project files). People who
     * cannot see every document get only the files they added themselves.
     */
    leadId: idSchema.optional(),
    /** A vendor's or a contractor's own papers (PRD 3.13, 3.14). */
    vendorId: idSchema.optional(),
    contractorId: idSchema.optional(),
    category: z.string().optional(),
  })
  .refine(
    (filter) =>
      Boolean(
        filter.projectId ||
          filter.taskId ||
          filter.customerId ||
          filter.leadId ||
          filter.vendorId ||
          filter.contractorId,
      ),
    'Choose a project, task, customer, lead, vendor or contractor.',
  );

/**
 * Upload form fields beside the `file` part. Multipart sends text, so ids arrive as
 * strings and empty strings mean "not linked".
 */
const optionalId = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined))
  .pipe(idSchema.optional());

export const uploadFieldsSchema = z
  .object({
    /** A library folder, or `customer_signature` for a sign-off drawn on a task. */
    category: z.enum([...DOCUMENT_CATEGORIES, ...TASK_EVIDENCE_CATEGORIES]),
    projectId: optionalId,
    taskId: optionalId,
    customerId: optionalId,
    propertyId: optionalId,
    /** A paper for a lead (an electricity bill, ID proof): kept on its customer and site. */
    leadId: optionalId,
    /** A vendor's or a contractor's own paper: agreement, licence, insurance, certificates. */
    vendorId: optionalId,
    contractorId: optionalId,
    name: z.string().trim().max(160).optional(),
    ...geotagFieldsSchema.shape,
  })
  .refine(
    (fields) =>
      Boolean(
        fields.projectId ||
          fields.taskId ||
          fields.customerId ||
          fields.leadId ||
          fields.vendorId ||
          fields.contractorId,
      ),
    'Link the file to a project, task, customer, lead, vendor or contractor.',
  );
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

/**
 * Staff move a paper to another home (a project of the same customer) or kind. No home
 * (`projectId` null) only for an ID or income paper, which is the person's.
 */
export const moveDocumentSchema = z.object({
  projectId: idSchema.nullable(),
  category: documentCategorySchema,
});
export type MoveDocument = z.infer<typeof moveDocumentSchema>;

/** One home of the paper's customer; `projectId` is null while the home is only a lead. */
export const documentHomeSchema = z.object({
  propertyId: idSchema,
  projectId: idSchema.nullable(),
  title: z.string(),
  description: z.string(),
});
export type DocumentHome = z.infer<typeof documentHomeSchema>;

/** The company's logo, signature and stamp as printed on quotations and reports. */
export const companyAssetsSchema = z.object({
  logo: attachmentSchema.nullable(),
  signature: attachmentSchema.nullable(),
  stamp: attachmentSchema.nullable(),
});
export type CompanyAssets = z.infer<typeof companyAssetsSchema>;
