import { REPORT_KEYS, type TaskTemplateInput } from '@oneohm/api-contracts';
import {
  isCustomerDocumentCategory,
  readTaskAttachment,
  TASK_MESSAGE_FIELDS,
} from '@oneohm/domain';
import { invalid } from '../../common/http/errors';

interface Known {
  readonly keys: ReadonlyMap<string, readonly string[]>;
  readonly roles: ReadonlySet<string>;
  readonly messages: ReadonlyMap<string, readonly string[]>;
  /** Active skill keys a template may ask for. */
  readonly skills?: ReadonlySet<string>;
  /** Report keys any DISCOM prints (Settings → DISCOMs); OneOhm's six when not given. */
  readonly reports?: ReadonlySet<string>;
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
  const reports = known.reports ?? new Set<string>(REPORT_KEYS);
  const unknownReports = input.reports.filter((key) => !reports.has(key));
  if (unknownReports.length > 0)
    throw invalid('Pick reports from the list.', {
      reports: `Unknown: ${unknownReports.join(', ')}.`,
    });
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
  checkCustomerWording(input);
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
  checkAttachment(input.attachment ?? null, fields.includes('link'), reports);
}

/**
 * Internal tasks never message customers (PRD 6.2 rule), and a customer message names
 * the step in the customer's words, never the team's task title (PRD 5.2).
 */
function checkCustomerWording(input: { customerVisible: boolean; customerTitle: string | null }) {
  if (!input.customerVisible)
    throw invalid('This task is internal. Let customers see it before it can message them.', {
      notifyCustomer: 'Turn on "Customers see this step in their app" first.',
    });
  if (!input.customerTitle?.trim())
    throw invalid('Write the step the way the customer should read it.', {
      customerTitle: 'For example "Net meter fitted".',
    });
}

/** A linked report or paper must be one customers may see, in a message with a link. */
function checkAttachment(
  attachment: string | null,
  messageHasLink: boolean,
  reports: ReadonlySet<string>,
) {
  const chosen = readTaskAttachment(attachment);
  if (attachment && !chosen)
    throw invalid('Pick a report or a folder from the list.', { attachment: 'Unknown link.' });
  if (chosen?.kind === 'report' && !reports.has(chosen.key))
    throw invalid('Pick a report from the list.', { attachment: 'Unknown report.' });
  if (chosen?.kind === 'document' && !isCustomerDocumentCategory(chosen.category))
    throw invalid('Customers cannot see papers in this folder.', {
      attachment: 'Pick a folder customers can see.',
    });
  if (chosen && !messageHasLink)
    throw invalid('This message has no place for a link.', {
      messageKey: 'Pick a message with a link, such as "Update with a link".',
    });
  if (!chosen && messageHasLink)
    throw invalid('This message needs a link.', {
      attachment: 'Pick the report or folder to link.',
    });
}
