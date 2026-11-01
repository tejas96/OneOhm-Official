import { inEveryLanguage } from '@/i18n/copy';
import * as en from './en/request-media';
import * as hi from './hi/request-media';
import * as mr from './mr/request-media';

/** A help request's voice note and short video, in the customer's language (English, Marathi or Hindi). */
export const REQUEST_MEDIA = inEveryLanguage(en.REQUEST_MEDIA, mr.REQUEST_MEDIA, hi.REQUEST_MEDIA);
