import { Inject, Injectable } from '@nestjs/common';
import type { MessageTemplate } from '@oneohm/api-contracts';
import { messageTemplates, taskTemplates } from '@oneohm/database';
import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { checkMessageTemplate } from './message-template-checks';

interface MessageTemplateChange {
  metaName: string;
  language: string;
  metaNameMr: string | null;
  metaNameHi: string | null;
  fields: string[];
  preview: string;
  active: boolean;
  extrasApproved?: boolean | undefined;
}

/** The WhatsApp templates, matched to what is approved in WhatsApp Manager. */
@Injectable()
export class MessageTemplatesService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<MessageTemplate[]> {
    const rows = await this.db.select().from(messageTemplates).orderBy(asc(messageTemplates.key));
    const uses = await this.db
      .select({ key: taskTemplates.messageKey, count: sql<number>`count(*)::int` })
      .from(taskTemplates)
      .where(eq(taskTemplates.notifyCustomer, true))
      .groupBy(taskTemplates.messageKey);
    const used = new Map(uses.map((row) => [row.key, row.count]));
    return rows.map((row) => ({
      key: row.key,
      audience: row.audience as MessageTemplate['audience'],
      metaName: row.metaName,
      language: row.language,
      metaNameMr: row.metaNameMr,
      metaNameHi: row.metaNameHi,
      fields: row.fields,
      preview: row.preview,
      active: row.active,
      extrasApproved: row.extrasApproved,
      usedByTasks: used.get(row.key) ?? 0,
    }));
  }

  async update(actor: Actor, key: string, change: MessageTemplateChange): Promise<MessageTemplate> {
    checkMessageTemplate(key, change);
    const [row] = await this.db
      .update(messageTemplates)
      .set({ ...change, updatedAt: new Date() })
      .where(eq(messageTemplates.key, key))
      .returning({ key: messageTemplates.key });
    if (!row) throw notFound('That message template');
    await recordAudit(this.db, actor.userId, 'message_template.updated', 'message_template', key, {
      metaName: change.metaName,
      active: change.active,
      extrasApproved: change.extrasApproved,
    });
    const updated = (await this.list()).find((template) => template.key === key);
    if (!updated) throw notFound('That message template');
    return updated;
  }
}
