import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/ratings';
import * as hi from './hi/ratings';
import * as mr from './mr/ratings';

/** Rating each finished stage (PRD 5.7), in the customer's language (English, Marathi or Hindi). */
export const STAGE_RATING = inEveryLanguage(en.STAGE_RATING, mr.STAGE_RATING, hi.STAGE_RATING);
