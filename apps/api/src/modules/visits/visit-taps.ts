import { VISIT_SLOTS, type VisitSlot } from '@oneohm/domain';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const DAY = '\\d{4}-\\d{2}-\\d{2}';
const ASK = new RegExp(`^vask:(${UUID})$`);
const PICK_DAY = new RegExp(`^vday:(${UUID}):(${DAY})$`);
const PICK_SLOT = new RegExp(`^vslot:(${UUID}):(${DAY}):(${VISIT_SLOTS.join('|')})$`);
const VISIT = new RegExp(`^(vcf|vok|vchg):(${UUID})$`);

/** A tap on a button or row the visit messages carry. */
export type VisitTap =
  /** [Pick a day] from the template: the list of free days. */
  | { readonly t: 'ask'; readonly actionId: string }
  | { readonly t: 'day'; readonly actionId: string; readonly day: string }
  | {
      readonly t: 'slot';
      readonly actionId: string;
      readonly day: string;
      readonly slot: VisitSlot;
    }
  /** [Confirm] / [I'll be there]. */
  | { readonly t: 'confirm'; readonly visitId: string }
  /** [Okay] under "Booked". */
  | { readonly t: 'okay'; readonly visitId: string }
  | { readonly t: 'change'; readonly visitId: string };

export function readVisitTap(id: string | null | undefined): VisitTap | null {
  if (!id) return null;
  const ask = ASK.exec(id);
  if (ask) return { t: 'ask', actionId: ask[1] as string };
  const day = PICK_DAY.exec(id);
  if (day) return { t: 'day', actionId: day[1] as string, day: day[2] as string };
  const slot = PICK_SLOT.exec(id);
  if (slot)
    return {
      t: 'slot',
      actionId: slot[1] as string,
      day: slot[2] as string,
      slot: slot[3] as VisitSlot,
    };
  const visit = VISIT.exec(id);
  if (!visit) return null;
  const t = ({ vcf: 'confirm', vok: 'okay', vchg: 'change' } as const)[visit[1] as 'vcf'];
  return { t, visitId: visit[2] as string };
}

export const isVisitTap = (id: string) => readVisitTap(id) !== null;
