import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  customerLanguageViewSchema,
  languageChoiceSchema,
} from '../schemas/customer-language.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

/** The customer app saves the language the customer chose (PRD 5.1). */
export const customerAppLanguageContract = c.router({
  setMyLanguage: {
    method: 'PUT',
    path: '/customer/language',
    body: languageChoiceSchema,
    responses: { 200: languageChoiceSchema },
    summary: 'Only the customer, not a family member, changes the language on the record.',
  },
});

/** Staff see and set a customer's language on the customer page. */
export const customerLanguageContract = c.router({
  customerLanguage: {
    method: 'GET',
    path: '/customers/:id/language',
    pathParams: idParams,
    responses: { 200: customerLanguageViewSchema },
  },
  setCustomerLanguage: {
    method: 'PUT',
    path: '/customers/:id/language',
    pathParams: idParams,
    body: languageChoiceSchema,
    responses: { 200: customerLanguageViewSchema },
  },
});
