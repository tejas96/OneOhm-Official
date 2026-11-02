import { todayIn } from '@oneohm/shared';
import { invalid } from './http/errors';

/** Money dates (paid, received, cleared, deposited) happen today or earlier. */
export function assertNotFuture(day: string | null | undefined, field: string): void {
  if (day && day > todayIn()) {
    throw invalid('This date cannot be in the future.', { [field]: 'Pick today or earlier.' });
  }
}
