import { initContract } from '@ts-rest/core';
import { businessReportQuerySchema } from '../schemas/reports/business-report.schema';
import { collectionsReportSchema } from '../schemas/reports/collections-report.schema';
import { delaysReportSchema } from '../schemas/reports/delays-report.schema';
import { deliveryReportSchema } from '../schemas/reports/delivery-report.schema';
import { profitabilityReportSchema } from '../schemas/reports/profitability-report.schema';
import { salesReportSchema } from '../schemas/reports/sales-report.schema';
import { serviceReportSchema } from '../schemas/reports/service-report.schema';
import { teamReportSchema } from '../schemas/reports/team-report.schema';

const c = initContract();
const query = businessReportQuerySchema;

/**
 * The business reports (PRD 3.1): counted from the records, filtered like the command
 * centre. Each one also downloads as CSV at the same path with `/csv` added.
 */
export const businessReportsContract = c.router({
  salesReport: {
    method: 'GET',
    path: '/business-reports/sales',
    query,
    responses: { 200: salesReportSchema },
    summary: 'Leads, quotations and orders won; conversion by source and salesperson.',
  },
  deliveryReport: {
    method: 'GET',
    path: '/business-reports/delivery',
    query,
    responses: { 200: deliveryReportSchema },
    summary: 'Tasks on time and late, systems commissioned, by project and stage.',
  },
  delaysReport: {
    method: 'GET',
    path: '/business-reports/delays',
    query,
    responses: { 200: delaysReportSchema },
    summary: 'Days lost, split by cause: internal, customer, bank or DISCOM.',
  },
  collectionsReport: {
    method: 'GET',
    path: '/business-reports/collections',
    query,
    responses: { 200: collectionsReportSchema },
    summary: 'Money collected, receivables and their age, by project and method.',
  },
  profitabilityReport: {
    method: 'GET',
    path: '/business-reports/profitability',
    query,
    responses: { 200: profitabilityReportSchema },
    summary: 'Estimated against actual cost and margin, per project.',
  },
  teamReport: {
    method: 'GET',
    path: '/business-reports/team',
    query,
    responses: { 200: teamReportSchema },
    summary: 'Work done on time, open and late, leave and attendance per person and crew.',
  },
  serviceReport: {
    method: 'GET',
    path: '/business-reports/service',
    query,
    responses: { 200: serviceReportSchema },
    summary: 'Service requests raised and resolved, resolution time and ratings.',
  },
});
