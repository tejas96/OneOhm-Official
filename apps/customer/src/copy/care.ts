import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/care';
import * as hi from './hi/care';
import * as mr from './mr/care';

/** Help requests, referrals and the overall rating, in the customer's language (English, Marathi or Hindi). */
export const SUPPORT = inEveryLanguage(en.SUPPORT, mr.SUPPORT, hi.SUPPORT);
export const REFER = inEveryLanguage(en.REFER, mr.REFER, hi.REFER);
export const FEEDBACK = inEveryLanguage(en.FEEDBACK, mr.FEEDBACK, hi.FEEDBACK);
