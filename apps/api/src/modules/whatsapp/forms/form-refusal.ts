import { MEDIA_WORDS } from '../assistant/words';
import type { FormRefusal } from './form-files';

/** What a customer is told when a file of their form was refused: the true reason. */
export const refusalWords = (why: FormRefusal): string =>
  ({
    too_large: MEDIA_WORDS.tooLarge,
    wrong_type: MEDIA_WORDS.wrongType,
    empty: MEDIA_WORDS.emptyFile,
    changed: MEDIA_WORDS.failed,
    failed: MEDIA_WORDS.failed,
  })[why];
