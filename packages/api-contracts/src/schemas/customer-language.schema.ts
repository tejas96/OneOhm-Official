import { CUSTOMER_LANGUAGES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema } from '../common/primitives';

/** English, Marathi or Hindi: the customer app and in-app updates (PRD 5.1). */
export const customerLanguageSchema = z.enum(CUSTOMER_LANGUAGES);

export const languageChoiceSchema = z.object({ language: customerLanguageSchema });
export type LanguageChoice = z.infer<typeof languageChoiceSchema>;

/** One customer's language, as staff see and set it on the customer page. */
export const customerLanguageViewSchema = z.object({
  customerId: idSchema,
  language: customerLanguageSchema,
});
export type CustomerLanguageView = z.infer<typeof customerLanguageViewSchema>;
