import { createHash } from 'node:crypto';
import { rows } from './db';
import type { Session } from './http';
import { replies, tap } from './onboarding';
import { sellProject } from './sales';

// Helpers for the "Send a paper" form scenarios (64-forms-*).

export const FLOW_ID = '990011223344';
export const OLD = 'That form is old — please try again.';
/** The photo the log-mode gateway stands in for every image. */
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
export const SAMPLE_PNG_SHA = createHash('sha256').update(SAMPLE_PNG).digest('base64');

export interface FlowReply {
  kind: string;
  body: string;
  button: string;
  flowId: string;
  token: string;
  screen: string;
  data: Record<string, string>;
  fallbackText?: string;
}

export const flowOf = async (phone: string) =>
  (await replies(phone)).filter((reply) => reply.kind === 'flow').at(-1) as unknown as
    | FlowReply
    | undefined;

export const bodies = async (phone: string) => (await replies(phone)).map((reply) => reply.body);

let counter = 0;
/** One photo as a form reply lists it; each call is a new WhatsApp file. */
export const photo = (name = 'bill', extra: Record<string, unknown> = {}) => {
  counter += 1;
  return {
    id: `form-media-${Date.now()}-${counter}`,
    file_name: `${name}.jpg`,
    mime_type: 'image/jpeg',
    ...extra,
  };
};

export const actionOf = async (id: string) =>
  (
    await rows<{ status: string; document_id: string | null }>(
      'SELECT status::text AS status, document_id FROM customer_actions WHERE id = $1',
      [id],
    )
  )[0];

/** Publishes the form (a flow id) or, with null, takes it out of use. */
export const setFlow = (id: string | null) =>
  id
    ? rows(
        `INSERT INTO wa_forms (key, flow_id) VALUES ('send_paper', $1)
         ON CONFLICT (key) DO UPDATE SET flow_id = EXCLUDED.flow_id`,
        [id],
      )
    : rows("DELETE FROM wa_forms WHERE key = 'send_paper'");

/** A sold project with an electricity bill asked for. */
export async function askedBill(admin: Session, name: string) {
  const { customer, project } = await sellProject(admin, { name });
  const ask = await admin.post<{ id: string }>('/document-requests', {
    projectId: project.id,
    category: 'electricity_bill',
    title: 'Electricity bill (test)',
    requirementKey: 'bill',
  });
  return { customer, project, ask };
}

/** [Send it now] for the asked paper; returns the form that went out. */
export async function openedForm(phone: string, askId: string): Promise<FlowReply> {
  await tap(phone, `sendit:${askId}`);
  return (await flowOf(phone)) as FlowReply;
}
