import { messageFieldsFor, unknownMessageFields } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

/**
 * A message's wording and fields must line up, and each field must be a detail its sender
 * fills: a name the sender cannot fill makes every send of that message fail.
 */
export function checkMessageTemplate(
  key: string,
  change: { readonly preview: string; readonly fields: readonly string[] },
): void {
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
