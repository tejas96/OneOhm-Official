import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/common';
import * as hi from './hi/common';
import * as mr from './mr/common';

/** Shared words, sign-in and Me, in the customer's language (English, Marathi or Hindi). */
export const COMMON = inEveryLanguage(en.COMMON, mr.COMMON, hi.COMMON);
export const SIGN_IN = inEveryLanguage(en.SIGN_IN, mr.SIGN_IN, hi.SIGN_IN);
export const PROFILE = inEveryLanguage(en.PROFILE, mr.PROFILE, hi.PROFILE);
