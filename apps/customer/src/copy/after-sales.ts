import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/after-sales';
import * as hi from './hi/after-sales';
import * as mr from './mr/after-sales';

/** Warranty, AMC, planned visits and rating a request (PRD 5.5), in the customer's language (English, Marathi or Hindi). */
export const COVER = inEveryLanguage(en.COVER, mr.COVER, hi.COVER);
export const VISITS = inEveryLanguage(en.VISITS, mr.VISITS, hi.VISITS);
export const RATE = inEveryLanguage(en.RATE, mr.RATE, hi.RATE);
