import type { MessageTemplate } from '@oneohm/api-contracts';
import { TASK_MESSAGE_FIELDS } from '@oneohm/domain';

/** One message a task can send, and whether it is turned off. */
export interface TaskMessageChoice {
  readonly key: string;
  readonly off: boolean;
}

/**
 * The customer messages a task can fill, without the turned-off ones: the sender skips a
 * turned-off message, so picking one would send nothing. The message already chosen stays
 * listed (marked off) so the owner sees what the task points at.
 */
export function taskMessageChoices(
  messages: readonly MessageTemplate[],
  chosenKey: string | null | undefined,
): TaskMessageChoice[] {
  return messages
    .filter(
      (message) =>
        message.audience === 'customer' &&
        message.fields.every((field) => (TASK_MESSAGE_FIELDS as readonly string[]).includes(field)),
    )
    .filter((message) => message.active || message.key === chosenKey)
    .map((message) => ({ key: message.key, off: !message.active }));
}
