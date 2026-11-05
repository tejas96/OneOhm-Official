import type { ReminderTimingRecord } from '@oneohm/api-contracts';
import { rows } from './db';
import { flowOf, photo } from './forms';
import type { Session } from './http';
import { lastReply } from './onboarding';
import type { Sale } from './sales';
import { openChat, sendTo, setForm } from './send';
import { sendInbound } from './whatsapp';

// Helpers for the self site survey scenarios (69-*, phase 5).

/** Changes the self-survey offer in Settings; returns how to put it back. */
export async function setOffer(
  admin: Session,
  patch: Partial<Pick<ReminderTimingRecord, 'selfSurveyOffer' | 'selfSurveyPaise'>>,
): Promise<() => Promise<unknown>> {
  const before = await admin.get<ReminderTimingRecord>('/settings/reminders');
  await admin.put('/settings/reminders', { ...before, ...patch });
  return () => admin.put('/settings/reminders', before);
}

export const surveyTask = async (sale: Sale) => {
  const [task] = await rows<{ id: string; status: string }>(
    "SELECT id, status::text AS status FROM project_tasks WHERE project_id = $1 AND template_key = 'site_survey'",
    [sale.project.id],
  );
  if (!task) throw new Error('No survey task.');
  return task.id;
};

export interface SurveyRow {
  id: string;
  status: string;
  payload: {
    answers: Record<string, string>;
    photos: Record<string, string>;
    askAgain: string[];
    awaiting: string | null;
    offerPaise: number;
    startedAt: string | null;
    sentAt: string | null;
    creditId: string | null;
  };
}

export const surveysOf = (customerId: string) =>
  rows<SurveyRow>(
    `SELECT id, status::text AS status, payload FROM customer_actions
      WHERE customer_id = $1 AND type = 'self_survey' ORDER BY created_at DESC`,
    [customerId],
  );

/** The team offers the survey from the survey step; the chat is open. Returns the ask. */
export async function offerSurvey(admin: Session, sale: Sale) {
  await openChat(sale.customer.phone, sale.customer.customerId);
  const taskId = await surveyTask(sale);
  const sent = await sendTo(admin, { taskId }, { action: 'self_survey', taskId });
  const [ask] = await surveysOf(sale.customer.customerId);
  if (!ask) throw new Error('No survey ask.');
  return { taskId, sent, ask };
}

/** Publishes the survey form (a flow id) or takes it out of use. */
export const publishSurvey = (id: string | null) => setForm('self_survey', id);

/** The four photos of a form reply, by the names of the form's screens. */
export const photos = () => ({
  corner_a: [photo('a')],
  corner_b: [photo('b')],
  meter: [photo('meter')],
  board: [photo('board')],
});

export const ANSWERS = { roof: 'rcc', floors: '2', shade: 'morning', size: 's2' };

/** [Start survey]: returns the form that went out. */
export async function startedForm(phone: string, askId: string) {
  await sendInbound(phone, { buttonReply: `ss:go:${askId}` });
  return flowOf(phone);
}

export const lastBody = async (phone: string) => (await lastReply(phone))?.body ?? '';

/** The money lines of the project's customer instalments, in order. */
export const instalments = (projectId: string) =>
  rows<{ id: string; label: string; amount: number; status: string }>(
    `SELECT id, label, amount_paise::bigint::int AS amount, status::text AS status FROM payment_milestones
      WHERE project_id = $1 AND payer = 'customer' ORDER BY position`,
    [projectId],
  );

export const credits = (projectId: string) =>
  rows<{ amount_paise: number; reversed_at: Date | null; milestone_id: string }>(
    'SELECT amount_paise::bigint::int AS amount_paise, reversed_at, milestone_id FROM milestone_credits WHERE project_id = $1 ORDER BY created_at',
    [projectId],
  );

/** The customer sends the whole survey in the chat way (no form): all answers and four photos. */
export async function sendWholeSurvey(phone: string, sale: Sale, askId: string): Promise<void> {
  const { tap } = await import('./onboarding');
  await tap(phone, `ss:ans:${askId}:roof:rcc`);
  await tap(phone, `ss:ans:${askId}:floors:2`);
  for (const item of ['a', 'b', 'meter', 'board'])
    await sendInbound(phone, {
      media: {
        type: 'image',
        fileId: `whole-${item}-${sale.project.id.slice(0, 8)}-${Date.now()}`,
      },
    });
  await tap(phone, `ss:ans:${askId}:shade:none`);
  await tap(phone, `ss:ans:${askId}:size:s2`);
  await sendInbound(phone, {
    text: `MH${sale.project.id.replace(/\D/g, '').slice(0, 9).padEnd(9, '7')}`,
  });
}
