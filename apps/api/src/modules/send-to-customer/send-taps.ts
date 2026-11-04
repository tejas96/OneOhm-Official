import { CALLBACK_SLOTS, type CallbackSlot } from '@oneohm/domain';
import { readHomeTap } from './location-pin.service';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const LOCATION = new RegExp(`^locreq:(${UUID})$`);
const PAID_OTHER = new RegExp(`^paidother:(${UUID})$`);
const PICK_TIME = new RegExp(`^cbask:(${UUID})$`);
const CALLBACK = new RegExp(`^cb:(${UUID}):(${CALLBACK_SLOTS.join('|')})$`);

/** A tap on a button the team's "Send to customer" messages carry. */
export type SendTap =
  /** [📍 Send location] from the template's button: now send the location request. */
  | { readonly t: 'locreq'; readonly actionId: string }
  /** [I paid another way] on an instalment. */
  | { readonly t: 'paidother'; readonly milestoneId: string }
  /** [Pick a time] on Home: the three time buttons again. */
  | { readonly t: 'cbask'; readonly actionId: string }
  | { readonly t: 'callback'; readonly actionId: string; readonly slot: CallbackSlot }
  /** A home picked in "Which home is this location for?". */
  | { readonly t: 'home'; readonly actionId: string; readonly propertyId: string };

/** The send tap an id stands for, or null. */
export function readSendTap(id: string | null | undefined): SendTap | null {
  if (!id) return null;
  const location = LOCATION.exec(id);
  if (location) return { t: 'locreq', actionId: location[1] as string };
  const paid = PAID_OTHER.exec(id);
  if (paid) return { t: 'paidother', milestoneId: paid[1] as string };
  const pick = PICK_TIME.exec(id);
  if (pick) return { t: 'cbask', actionId: pick[1] as string };
  const callback = CALLBACK.exec(id);
  if (callback)
    return { t: 'callback', actionId: callback[1] as string, slot: callback[2] as CallbackSlot };
  const home = readHomeTap(id);
  return home ? { t: 'home', ...home } : null;
}

/** True for any send tap: the assistant's own buttons, answered even while a person has the chat. */
export const isSendTap = (id: string) => readSendTap(id) !== null;
