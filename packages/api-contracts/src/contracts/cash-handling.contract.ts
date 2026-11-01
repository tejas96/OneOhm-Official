import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  bounceChequeSchema,
  cashPositionSchema,
  clearChequeSchema,
  handledPaymentSchema,
  moneyDepositSchema,
  newDepositSchema,
} from '../schemas/cash-handling.schema';

const c = initContract();
const paymentParams = z.object({ paymentId: idSchema });

/** Cash and cheques from collection to the bank (PRD 3.11). */
export const cashHandlingContract = c.router({
  cashPosition: {
    method: 'GET',
    path: '/finance/cash',
    responses: { 200: cashPositionSchema },
    summary: 'Cash in hand by collector, and cheques not yet cleared.',
  },
  listDeposits: {
    method: 'GET',
    path: '/finance/deposits',
    responses: { 200: z.array(moneyDepositSchema) },
  },
  depositItems: {
    method: 'GET',
    path: '/finance/deposits/:id/items',
    pathParams: z.object({ id: idSchema }),
    responses: { 200: z.array(handledPaymentSchema) },
  },
  createDeposit: {
    method: 'POST',
    path: '/finance/deposits',
    body: newDepositSchema,
    responses: { 201: moneyDepositSchema },
    summary: 'A deposit slip: the cash leaves cash in hand; cheques wait to clear.',
  },
  clearCheque: {
    method: 'POST',
    path: '/finance/cheques/:paymentId/clear',
    pathParams: paymentParams,
    body: clearChequeSchema,
    responses: { 200: handledPaymentSchema },
  },
  bounceCheque: {
    method: 'POST',
    path: '/finance/cheques/:paymentId/bounce',
    pathParams: paymentParams,
    body: bounceChequeSchema,
    responses: { 200: handledPaymentSchema },
    summary: 'The cheque was returned: the payment is reversed and the milestone reopens.',
  },
});
