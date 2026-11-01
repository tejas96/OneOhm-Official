import { LINE_CATEGORIES } from '@oneohm/domain';
import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { companySchema, discomSchema, productSchema } from '../schemas/catalog.schema';

const c = initContract();

export const catalogContract = c.router({
  listProducts: {
    method: 'GET',
    path: '/catalog/products',
    query: z.object({ category: z.enum(LINE_CATEGORIES).optional() }),
    responses: { 200: z.array(productSchema) },
  },
  listDiscoms: { method: 'GET', path: '/discoms', responses: { 200: z.array(discomSchema) } },
  getCompany: { method: 'GET', path: '/settings/company', responses: { 200: companySchema } },
  updateCompany: {
    method: 'PATCH',
    path: '/settings/company',
    body: companySchema.partial(),
    responses: { 200: companySchema },
  },
});
