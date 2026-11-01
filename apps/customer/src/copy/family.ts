import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/family';
import * as hi from './hi/family';
import * as mr from './mr/family';

/** Family access (PRD 5.1), in the customer's language (English, Marathi or Hindi). */
export const FAMILY = inEveryLanguage(en.FAMILY, mr.FAMILY, hi.FAMILY);
