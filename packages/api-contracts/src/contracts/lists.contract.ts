import { initContract } from '@ts-rest/core';
import {
  customerPageQuerySchema,
  customerPageSchema,
  leadPageQuerySchema,
  leadPageSchema,
  paymentPageQuerySchema,
  paymentPageSchema,
  projectPageQuerySchema,
  projectPageSchema,
  quotationPageQuerySchema,
  quotationPageSchema,
  servicePageQuerySchema,
  servicePageSchema,
} from '../schemas/list-page.schema';

const c = initContract();

/**
 * The long lists a page at a time, filtered, ordered and counted on the server (PRD 9.3,
 * "routine navigation stays instant"). Each answers the same rights as its whole list.
 */
export const listsContract = c.router({
  projects: {
    method: 'GET',
    path: '/lists/projects',
    query: projectPageQuerySchema,
    responses: { 200: projectPageSchema },
    summary: 'Project cards, live first by default; `capacityWp` sums every match.',
  },
  leads: {
    method: 'GET',
    path: '/lists/leads',
    query: leadPageQuerySchema,
    responses: { 200: leadPageSchema },
    summary: 'Leads the person may see, next follow-up first.',
  },
  customers: {
    method: 'GET',
    path: '/lists/customers',
    query: customerPageQuerySchema,
    responses: { 200: customerPageSchema },
    summary: 'Customers by name.',
  },
  quotations: {
    method: 'GET',
    path: '/lists/quotations',
    query: quotationPageQuerySchema,
    responses: { 200: quotationPageSchema },
    summary: 'Quotations the person may see, newest first.',
  },
  serviceRequests: {
    method: 'GET',
    path: '/lists/service-requests',
    query: servicePageQuerySchema,
    responses: { 200: servicePageSchema },
    summary: 'Service requests and planned visits, newest first.',
  },
  payments: {
    method: 'GET',
    path: '/lists/payments',
    query: paymentPageQuerySchema,
    responses: { 200: paymentPageSchema },
    summary: 'Money received with its receipt numbers, newest first.',
  },
});
