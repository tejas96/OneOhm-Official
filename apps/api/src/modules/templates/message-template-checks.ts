import { messageFieldsFor, unknownMessageFields } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

/** The visit messages, whose buttons are the whole point (redesign §8). */
const VISIT_MESSAGES = ['visit_pick', 'visit_booked', 'visit_reminder', 'inspection_presence'];

/**
 * A message's wording and fields must line up, and each field must be a detail its sender
 * fills: a name the sender cannot fill makes every send of that message fail.
 */
export function checkMessageTemplate(
  key: string,
  change: {
    readonly preview: string;
    readonly fields: readonly string[];
    readonly active?: boolean | undefined;
    readonly extrasApproved?: boolean | undefined;
  },
): void {
  // A visit message is only its buttons: switched on without them the customer could not answer.
  if (change.active && !change.extrasApproved && VISIT_MESSAGES.includes(key))
    throw invalid('Switch on "Meta approved the version with file and buttons" first.', {
      active: 'This message needs its buttons: turn on the buttons switch first.',
    });
  const slots = new Set(change.preview.match(/\{\{\d+\}\}/g) ?? []).size;
  if (slots !== change.fields.length)
    throw invalid('The wording and the fields do not match.', {
      fields: `The wording has ${slots} placeholders; give ${slots} fields in order.`,
    });
  const unknown = unknownMessageFields(key, change.fields);
  if (unknown.length)
    throw invalid(`This message cannot fill ${unknown.join(', ')}.`, {
      fields: `This message cannot fill ${unknown.join(', ')}. Use only: ${messageFieldsFor(key)?.join(', ')}.`,
    });
}
