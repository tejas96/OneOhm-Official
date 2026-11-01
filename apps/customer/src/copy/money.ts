import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/money';
import * as hi from './hi/money';
import * as mr from './mr/money';

/** Payments, invoice and receipts, and documents, in the customer's language (English, Marathi or Hindi). */
export const PAYMENTS = inEveryLanguage(en.PAYMENTS, mr.PAYMENTS, hi.PAYMENTS);
export const BILLING = inEveryLanguage(en.BILLING, mr.BILLING, hi.BILLING);
export const DOCUMENTS = inEveryLanguage(en.DOCUMENTS, mr.DOCUMENTS, hi.DOCUMENTS);
