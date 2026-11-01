import type { TaskTemplateInput } from '@oneohm/api-contracts';
import { TASK_MESSAGE_FIELDS } from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

interface Known {
  readonly keys: ReadonlyMap<string, readonly string[]>;
  readonly roles: ReadonlySet<string>;
  readonly messages: ReadonlyMap<string, readonly string[]>;
  /** Active skill keys a template may ask for. */
  readonly skills?: ReadonlySet<string>;
}

/** True when following `dependsOn` from `start` comes back to it. */
function makesLoop(start: string, graph: ReadonlyMap<string, readonly string[]>): boolean {
  const seen = new Set<string>();
  const stack = [...(graph.get(start) ?? [])];
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (key === start) return true;
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push(...(graph.get(key) ?? []));
  }
  return false;
}

/**
 * A template must name a real role, depend only on existing tasks without a loop, and,
 * when it messages the customer, use a template a task can fill.
 */
export function checkTaskTemplate(
  input: Omit<TaskTemplateInput, 'key'> & { key: string },
  known: Known,
) {
  if (!known.roles.has(input.roleKey))
    throw invalid('Pick a role from the list.', { roleKey: 'Unknown role.' });
  const lineKeys = (input.checklist ?? []).map((line) => line.key);
  if (new Set(lineKeys).size !== lineKeys.length)
    throw invalid('Two checklist lines say the same thing.', { checklist: 'Remove the repeat.' });
  if (input.skillKey && known.skills && !known.skills.has(input.skillKey))
    throw invalid('Pick a skill from the list.', { skillKey: 'Unknown or switched-off skill.' });
  const missing = input.dependsOn.filter((key) => !known.keys.has(key) || key === input.key);
  if (missing.length > 0)
    throw invalid('A task can only wait for other existing tasks.', {
      dependsOn: `Not found: ${missing.join(', ')}.`,
    });
  const graph = new Map(known.keys);
  graph.set(input.key, input.dependsOn);
  if (makesLoop(input.key, graph))
    throw invalid('These waits go round in a circle.', {
      dependsOn: 'A task cannot wait, directly or not, for itself.',
    });
  if (!input.notifyCustomer) return;
  if (input.notifyEvent === 'approved' && !input.approval)
    throw invalid('This task has no approval step.', {
      notifyEvent: 'Send on completion, or turn approval on.',
    });
  const fields = known.messages.get(input.messageKey);
  if (!fields)
    throw invalid('Pick a WhatsApp message from the list.', { messageKey: 'Unknown message.' });
  const allowed = new Set<string>(TASK_MESSAGE_FIELDS);
  const extra = fields.filter((field) => !allowed.has(field));
  if (extra.length > 0)
    throw invalid('A task cannot fill this message.', {
      messageKey: `It needs ${extra.join(', ')}, which a task does not have.`,
    });
}
