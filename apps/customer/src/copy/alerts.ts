import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/alerts';
import * as hi from './hi/alerts';
import * as mr from './mr/alerts';

/** The updates inbox, in the customer's language (English, Marathi or Hindi). */
export const ALERTS = inEveryLanguage(en.ALERTS, mr.ALERTS, hi.ALERTS);
