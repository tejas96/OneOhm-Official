import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/home';
import * as hi from './hi/home';
import * as mr from './mr/home';

/** The solar journey on Home, in the customer's language (English, Marathi or Hindi). */
export const STAGE_MEANING = inEveryLanguage(en.STAGE_MEANING, mr.STAGE_MEANING, hi.STAGE_MEANING);
export const MILESTONE = inEveryLanguage(en.MILESTONE, mr.MILESTONE, hi.MILESTONE);
export const HOME = inEveryLanguage(en.HOME, mr.HOME, hi.HOME);
