import { type Database, messageTemplates, type outbox } from '@oneohm/database';
import { templateIsOn } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import {
  approvedMessage,
  MESSAGE_TEMPLATES,
  MissingFieldError,
} from '../channels/message-templates';
import type { TemplateButton, TemplateHeader } from '../channels/whatsapp-cloud';
import { optOutNote } from './in-window';

/** An approved template with its values, ready to send. */
export type Prepared = {
  readonly verdict: 'send';
  readonly name: string;
  readonly language: string;
  readonly parameters: string[];
  readonly header?: TemplateHeader;
  readonly buttons?: TemplateButton[];
};

/** Why a message cannot go out as is, or the approved template and values it needs. */
export async function prepareTemplate(
  db: Database,
  language: string,
  row: typeof outbox.$inferSelect,
): Promise<{ readonly verdict: 'skipped' | 'failed'; readonly note: string } | Prepared> {
  if (row.channel !== 'whatsapp') {
    return { verdict: 'skipped', note: `The ${row.channel} channel is not connected yet.` };
  }
  const [config] = await db
    .select()
    .from(messageTemplates)
    .where(eq(messageTemplates.key, row.template))
    .limit(1);
  const fields = config?.fields ?? MESSAGE_TEMPLATES[row.template];
  if (!fields) {
    return { verdict: 'failed', note: `No WhatsApp template is set up for "${row.template}".` };
  }
  if (!templateIsOn(row.template, config))
    return { verdict: 'skipped', note: 'This message is turned off in Settings.' };
  const unwanted = await optOutNote(db, row.recipient);
  if (unwanted) return { verdict: 'skipped', note: unwanted };
  try {
    const names = { metaName: row.template, language, ...config };
    return {
      verdict: 'send',
      ...approvedMessage(
        row.template,
        fields,
        names,
        row.payload,
        config?.extrasApproved,
        config?.quickRepliesApproved,
      ),
    };
  } catch (error) {
    if (!(error instanceof MissingFieldError)) throw error;
    return { verdict: 'failed', note: error.message };
  }
}
