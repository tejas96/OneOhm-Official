import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  amcContractSchema,
  amcPlanInputSchema,
  amcPlanSchema,
  amcSaleInputSchema,
  customerAfterSalesSchema,
  customerServiceCategorySchema,
  installedAssetPatchSchema,
  installedAssetSchema,
  projectAfterSalesSchema,
  serviceCategoryInputSchema,
  serviceCategorySchema,
  serviceRatingInputSchema,
  warrantyPolicySchema,
  warrantySettingsSchema,
} from '../schemas/after-sales.schema';
import { serviceRequestSchema } from '../schemas/customer-portal.schema';

const c = initContract();
const byId = z.object({ id: idSchema });

/**
 * After-sales for the office (PRD 3.17, 7.2): service categories and their hours,
 * warranty years, AMC plans, and each project's installed system and contracts.
 */
export const afterSalesContract = c.router({
  listServiceCategories: {
    method: 'GET',
    path: '/settings/service-categories',
    responses: { 200: z.array(serviceCategorySchema) },
  },
  createServiceCategory: {
    method: 'POST',
    path: '/settings/service-categories',
    body: serviceCategoryInputSchema,
    responses: { 201: serviceCategorySchema },
  },
  updateServiceCategory: {
    method: 'PATCH',
    path: '/settings/service-categories/:id',
    pathParams: byId,
    body: serviceCategoryInputSchema,
    responses: { 200: serviceCategorySchema },
    summary: 'New hours apply to requests raised from now on.',
  },
  warrantyPolicy: {
    method: 'GET',
    path: '/settings/warranty',
    responses: { 200: warrantySettingsSchema },
  },
  saveWarrantyPolicy: {
    method: 'PUT',
    path: '/settings/warranty',
    body: warrantyPolicySchema,
    responses: { 200: warrantySettingsSchema },
    summary: 'Applies to systems commissioned from now on; recorded warranties keep their dates.',
  },
  listAmcPlans: {
    method: 'GET',
    path: '/settings/amc-plans',
    responses: { 200: z.array(amcPlanSchema) },
  },
  createAmcPlan: {
    method: 'POST',
    path: '/settings/amc-plans',
    body: amcPlanInputSchema,
    responses: { 201: amcPlanSchema },
  },
  updateAmcPlan: {
    method: 'PATCH',
    path: '/settings/amc-plans/:id',
    pathParams: byId,
    body: amcPlanInputSchema,
    responses: { 200: amcPlanSchema },
    summary: 'Contracts already sold keep the terms they were sold on.',
  },
  projectAfterSales: {
    method: 'GET',
    path: '/projects/:id/after-sales',
    pathParams: byId,
    responses: { 200: projectAfterSalesSchema },
  },
  recordAssets: {
    method: 'POST',
    path: '/projects/:id/installed-assets',
    pathParams: byId,
    body: c.noBody(),
    responses: { 200: projectAfterSalesSchema },
    summary: 'Records the system from the accepted quotation; commissioning does this itself.',
  },
  updateAsset: {
    method: 'PATCH',
    path: '/installed-assets/:id',
    pathParams: byId,
    body: installedAssetPatchSchema,
    responses: { 200: installedAssetSchema },
  },
  sellAmc: {
    method: 'POST',
    path: '/projects/:id/amc',
    pathParams: byId,
    body: amcSaleInputSchema,
    responses: { 201: amcContractSchema },
    summary: 'Plans the visits across the contract; each opens as a service request a week ahead.',
  },
  cancelAmc: {
    method: 'POST',
    path: '/amc/:id/cancel',
    pathParams: byId,
    body: c.noBody(),
    responses: { 200: amcContractSchema },
    summary: 'Visits not yet opened are dropped; open visit requests stay with the desk.',
  },
});

/** The customer app's warranty, AMC, visits, category list and ratings (PRD 5.5). */
export const customerAfterSalesContract = c.router({
  cover: {
    method: 'GET',
    path: '/customer/after-sales',
    responses: { 200: customerAfterSalesSchema },
  },
  serviceCategories: {
    method: 'GET',
    path: '/customer/service-categories',
    responses: { 200: z.array(customerServiceCategorySchema) },
  },
  rateServiceRequest: {
    method: 'POST',
    path: '/customer/service-requests/:id/rating',
    pathParams: byId,
    body: serviceRatingInputSchema,
    responses: { 200: serviceRequestSchema },
    summary: 'Once a request is resolved; rating again replaces the earlier rating.',
  },
});
