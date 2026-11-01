import { z } from 'zod';
import { idSchema, nameSchema, phoneSchema } from '../common/primitives';

/** Someone the customer lets into their app (PRD 5.1). */
export const familyMemberSchema = z.object({
  id: idSchema,
  name: z.string(),
  phone: z.string(),
  relation: z.string(),
  createdAt: z.string(),
});
export type FamilyMember = z.infer<typeof familyMemberSchema>;

export const newFamilyMemberSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  relation: z.string().trim().max(40).default(''),
});
export type NewFamilyMember = z.input<typeof newFamilyMemberSchema>;
