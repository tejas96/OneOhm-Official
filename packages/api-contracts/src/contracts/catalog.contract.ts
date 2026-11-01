import { LINE_CATEGORIES } from '@oneohm/domain';
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import { companySchema, discomSchema, productSchema } from '../schemas/catalog.schema';
import {
  companyInputSchema,
  discomInputSchema,
  productInputSchema,
  rateCardSchema,
  rateCardSettingsSchema,
  subsidyRuleSchema,
} from '../schemas/settings.schema';

const c = initContract();
const idParams = z.object({ id: idSchema });

export const catalogContract = c.router({
  listProducts: {
    method: 'GET',
    path: '/catalog/products',
    query: z.object({
      category: z.enum(LINE_CATEGORIES).optional(),
      /** Settings shows archived products too; pickers never do. */
      includeInactive: z.coerce.boolean().optional(),
    }),
    responses: { 200: z.array(productSchema) },
  },
  createProduct: {
    method: 'POST',
    path: '/catalog/products',
    body: productInputSchema,
    responses: { 201: productSchema },
  },
  updateProduct: {
    method: 'PATCH',
    path: '/catalog/products/:id',
    pathParams: idParams,
    body: productInputSchema.partial(),
    responses: { 200: productSchema },
  },
  listDiscoms: { method: 'GET', path: '/discoms', responses: { 200: z.array(discomSchema) } },
  createDiscom: {
    method: 'POST',
    path: '/discoms',
    body: discomInputSchema,
    responses: { 201: discomSchema },
  },
  updateDiscom: {
    method: 'PATCH',
    path: '/discoms/:id',
    pathParams: idParams,
    body: discomInputSchema.partial(),
    responses: { 200: discomSchema },
  },
  getRateCard: {
    method: 'GET',
    path: '/settings/rate-card',
    responses: { 200: rateCardSettingsSchema },
  },
  updateRateCard: {
    method: 'PUT',
    path: '/settings/rate-card',
    body: rateCardSchema,
    responses: { 200: rateCardSettingsSchema },
  },
  listSubsidyRules: {
    method: 'GET',
    path: '/settings/subsidy-rules',
    responses: { 200: z.array(subsidyRuleSchema) },
  },
  getCompany: { method: 'GET', path: '/settings/company', responses: { 200: companySchema } },
  updateCompany: {
    method: 'PATCH',
    path: '/settings/company',
    body: companyInputSchema.partial(),
    responses: { 200: companySchema },
  },
});
