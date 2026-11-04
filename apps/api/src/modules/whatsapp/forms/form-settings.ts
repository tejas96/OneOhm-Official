import { Inject, Injectable } from '@nestjs/common';
import { waForms } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../../common/audit';
import type { Actor } from '../../../common/auth/actor';
import { notFound } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { FORMS, isFormKey } from './form-registry';

export interface FormRow {
  readonly key: string;
  readonly name: string;
  readonly version: string;
  readonly flowId: string | null;
}

/**
 * Settings → WhatsApp → Forms: each form we can send, its version, and the flow id it was
 * published as. A form with no flow id is "not available": the chat asks for the photo
 * instead. The owner pastes the id when a form is published by hand.
 */
@Injectable()
export class FormSettingsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(): Promise<FormRow[]> {
    const saved = new Map(
      (await this.db.select().from(waForms)).map((row) => [row.key, row.flowId]),
    );
    return FORMS.map((form) => ({
      key: form.key,
      name: form.name,
      version: form.version,
      flowId: saved.get(form.key)?.trim() || null,
    }));
  }

  /** Saves the id (an empty one takes the form out of use) and says so in the audit log. */
  async save(actor: Actor, key: string, flowId: string): Promise<FormRow> {
    if (!isFormKey(key)) throw notFound('That form');
    await this.db.transaction(async (tx) => {
      if (flowId === '') await tx.delete(waForms).where(eq(waForms.key, key));
      else
        await tx
          .insert(waForms)
          .values({ key, flowId, updatedByUserId: actor.userId })
          .onConflictDoUpdate({
            target: waForms.key,
            set: { flowId, updatedByUserId: actor.userId, updatedAt: new Date() },
          });
      await recordAudit(tx, actor.userId, 'settings.whatsapp_form_changed', 'settings', key, {
        flowId: flowId || null,
      });
    });
    const row = (await this.list()).find((one) => one.key === key);
    if (!row) throw notFound('That form');
    return row;
  }
}
