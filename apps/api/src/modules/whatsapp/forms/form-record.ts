import {
  type DatabaseExecutor,
  projects,
  properties,
  readBusinessSetting,
  waConversations,
  waFlowTokens,
  waMessages,
} from '@oneohm/database';
import { and, desc, eq, sql } from 'drizzle-orm';
import { FORMS, isFormKey } from './form-registry';
import type { IncomingForm } from './form-reply-data';
import { type FormData, type FormLink, formBody, formRows } from './form-summary';

/** The words and data the chat row of a form reply is saved with. */
export interface FormReplyRow {
  readonly body: string;
  readonly data: FormData;
}

/** The home named by the project the customer picked (its site label, else its town). */
async function homeOf(db: DatabaseExecutor, projectId: string | undefined) {
  // A forged or stale answer is not an id: no home, never an error on the webhook.
  if (
    !projectId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
  )
    return null;
  const [row] = await db
    .select({ label: properties.label, city: properties.city })
    .from(projects)
    .innerJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row ? row.label || row.city : null;
}

/** The onboarding form's token, kept in the chat's onboarding state while it waits for its reply. */
async function onboardingToken(db: DatabaseExecutor, conversationId: string, token: string) {
  const [chat] = await db
    .select({ context: waConversations.context })
    .from(waConversations)
    .where(eq(waConversations.id, conversationId))
    .limit(1);
  const context = (chat?.context ?? {}) as { ob?: { form?: { token?: string } } };
  return context.ob?.form?.token === token ? { formKey: 'onboarding', payload: {} } : null;
}

/** The bill bands as Settings names them, so a custom band shows its own words. */
async function billLabelsOf(db: DatabaseExecutor): Promise<Record<string, string>> {
  const settings = await readBusinessSetting(db, 'onboarding');
  return Object.fromEntries(settings.billBands.map((band) => [band.id, band.label]));
}

/**
 * What staff see for a form reply: the form's name and the answers as readable rows. The token
 * is read, not taken (the reply handler takes it); null for a token we do not know, which keeps
 * the plain "Sent a form" row.
 */
export async function formReplyRow(
  db: DatabaseExecutor,
  conversationId: string,
  form: IncomingForm,
): Promise<FormReplyRow | null> {
  if (!form.token) return null;
  const [token] = await db
    .select({ formKey: waFlowTokens.formKey, payload: waFlowTokens.payload })
    .from(waFlowTokens)
    .where(and(eq(waFlowTokens.token, form.token), eq(waFlowTokens.conversationId, conversationId)))
    .limit(1);
  // The onboarding form keeps its one token in the chat (a new number has no customer yet).
  const found = token ?? (await onboardingToken(db, conversationId, form.token));
  if (!found || !isFormKey(found.formKey)) return null;
  const key = found.formKey;
  const title = FORMS.find((one) => one.key === key)?.name ?? key;
  const payload =
    found.payload && typeof found.payload === 'object'
      ? (found.payload as Record<string, unknown>)
      : {};
  const home = key === 'report_problem' ? await homeOf(db, form.answers.home) : null;
  const billLabels = key === 'onboarding' ? await billLabelsOf(db) : undefined;
  const rows = formRows(key, form, { payload, home, ...(billLabels && { billLabels }) });
  return { body: formBody(title, rows, form), data: { form: { key, title, rows, fileIds: [] } } };
}

/** The newest form reply of a chat (the one being answered while its handler runs). */
export async function latestFormReply(db: DatabaseExecutor, chatId: string) {
  const [row] = await db
    .select({ id: waMessages.id, data: waMessages.data })
    .from(waMessages)
    .where(
      and(
        eq(waMessages.conversationId, chatId),
        eq(waMessages.direction, 'in'),
        eq(waMessages.kind, 'form'),
      ),
    )
    .orderBy(desc(waMessages.createdAt))
    .limit(1);
  const data = row?.data as Partial<FormData> | null | undefined;
  return row && data?.form ? { id: row.id, form: data.form } : null;
}

/** Adds files to the card of the newest form reply. */
export async function addFormFiles(
  db: DatabaseExecutor,
  formMessageId: string,
  fileIds: readonly string[],
): Promise<void> {
  await db
    .update(waMessages)
    .set({
      data: sql`jsonb_set(${waMessages.data}, '{form,fileIds}',
        coalesce(${waMessages.data} #> '{form,fileIds}', '[]'::jsonb) || ${JSON.stringify(fileIds)}::jsonb)`,
    })
    .where(eq(waMessages.id, formMessageId));
}

/** Lets a reply handler say what the form made (a ticket, a lead), so the card links to it. */
export async function linkFormReply(
  db: DatabaseExecutor,
  chatId: string,
  link: FormLink,
): Promise<void> {
  const latest = await latestFormReply(db, chatId);
  if (!latest) return;
  await db
    .update(waMessages)
    .set({
      data: sql`jsonb_set(${waMessages.data}, '{form,link}', ${JSON.stringify(link)}::jsonb)`,
    })
    .where(eq(waMessages.id, latest.id));
}

/** Links the form reply to its project, or to the customer when there is none. */
export const linkFormToProject = (
  db: DatabaseExecutor,
  chatId: string,
  projectId: string | null,
  customerId: string,
) =>
  linkFormReply(
    db,
    chatId,
    projectId ? { kind: 'project', id: projectId } : { kind: 'customer', id: customerId },
  );
