import { slotLabel, type VisitSlot } from '@oneohm/domain';
import { dayWords } from './visit-messages';

/** "Sat 14 Nov, 10:00–11:30 am" (older rows without a time: "Sat 14 Nov, morning"). */
export const visitWhen = (
  day: string,
  slot: VisitSlot,
  startMin?: number | null,
  endMin?: number | null,
): string =>
  `${dayWords(day)}, ${startMin != null && endMin != null ? slotLabel(startMin, endMin) : slot}`;
