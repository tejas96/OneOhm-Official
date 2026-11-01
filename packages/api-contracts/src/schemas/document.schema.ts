import { COMPANY_ASSET_KINDS, DOCUMENT_CATEGORIES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';
import { userRefSchema } from './crm.schema';

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
  uploadedBy: userRefSchema.nullable(),
  /** True when this file replaced an earlier one (the earlier file is not shown). */
  replaced: z.boolean(),
});
export type DocumentRecord = z.infer<typeof documentSchema>;

export const documentFilterSchema = z
  .object({
    projectId: idSchema.optional(),
    taskId: idSchema.optional(),
    customerId: idSchema.optional(),
    category: z.string().optional(),
  })
  .refine(
    (filter) => Boolean(filter.projectId || filter.taskId || filter.customerId),
    'Choose a project, task or customer.',
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
    category: documentCategorySchema,
    projectId: optionalId,
    taskId: optionalId,
    customerId: optionalId,
    propertyId: optionalId,
    name: z.string().trim().max(160).optional(),
  })
  .refine(
    (fields) => Boolean(fields.projectId || fields.taskId || fields.customerId),
    'Link the file to a project, task or customer.',
  );
export type UploadFields = z.infer<typeof uploadFieldsSchema>;

/** The company's logo, signature and stamp as printed on quotations and reports. */
export const companyAssetsSchema = z.object({
  logo: attachmentSchema.nullable(),
  signature: attachmentSchema.nullable(),
  stamp: attachmentSchema.nullable(),
});
export type CompanyAssets = z.infer<typeof companyAssetsSchema>;
