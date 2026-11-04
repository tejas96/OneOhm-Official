/** The parts of a Meta message that a location, contact card, sticker or reaction sit in. */
interface OtherMessage {
  type?: string;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
  reaction?: { emoji?: string };
}

/** The place a pin names, as a map link. */
function readLocation({
  latitude,
  longitude,
  name,
  address,
}: NonNullable<OtherMessage['location']>) {
  const place = [name, address].filter(Boolean).join(', ');
  return `📍 Location: ${place ? `${place} ` : ''}https://maps.google.com/?q=${latitude},${longitude}`;
}

/** What a message that is not text or a file says in the chat; its type when we do not know it. */
export function readOther(message: OtherMessage): string {
  if (message.type === 'sticker') return 'Sticker';
  if (message.type === 'location' && message.location) return readLocation(message.location);
  const cards = (message.type === 'contacts' ? message.contacts : null) ?? [];
  if (cards.length > 0)
    return cards
      .map((card) =>
        `👤 Contact: ${card.name?.formatted_name ?? ''} ${card.phones?.[0]?.phone ?? ''}`.trim(),
      )
      .join('\n');
  if (message.type === 'reaction')
    return `Reaction${message.reaction?.emoji ? ` ${message.reaction.emoji}` : ''}`;
  if (message.type === 'unsupported') return 'Unsupported message';
  return message.type ? `Message (${message.type})` : 'Message';
}
