import { updateLeadFromChat } from '../../crm/lead-from-chat';
import { queueReply } from '../chat-store';
import type { IncomingLocation } from '../whatsapp-events';
import { MORE_WORDS } from './onboard-words-more';
import { cityFromPin } from './onboarding-answer';
import { speak, type Turn } from './onboarding-turn';

/** A reply in the language chosen; `location` makes it WhatsApp's own [📍 Send location] message. */
export const say = (turn: Turn, body: string, location = false) =>
  speak(turn, () =>
    queueReply(
      turn.tx,
      turn.chat,
      location ? { kind: 'location_request', body } : { kind: 'text', body },
    ),
  );

/** The city a pin names (kept: the pin goes on the lead once there is one), or null when it names none we serve. */
export function pinnedCity(turn: Turn, pin: IncomingLocation): string | null {
  turn.pin = { latitude: pin.latitude, longitude: pin.longitude };
  return cityFromPin(pin, turn.settings.serviceCities);
}

/** A pin named no known city: say so; the city question is asked next (typed when there is no list). */
export async function pinWaits(turn: Turn): Promise<void> {
  turn.awaiting = turn.settings.serviceCities.length === 0 ? 'city' : undefined;
  await say(turn, MORE_WORDS.pinNoCity);
}

/** The pin as a history note on the lead, once, when the city answer has made it. */
export async function notePin(turn: Turn, leadId: string): Promise<void> {
  if (!turn.pin) return;
  const { latitude, longitude } = turn.pin;
  turn.pin = undefined;
  await updateLeadFromChat(
    turn.tx,
    leadId,
    {},
    `Location pin: https://maps.google.com/?q=${latitude},${longitude}`,
  );
}
