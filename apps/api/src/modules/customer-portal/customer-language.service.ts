import { Inject, Injectable } from '@nestjs/common';
import type { CustomerLanguageView } from '@oneohm/api-contracts';
import { customers, type DatabaseExecutor } from '@oneohm/database';
import { type CustomerLanguage, customerLanguage } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';

interface Signed {
  readonly customerId: string;
  readonly contactId: string | null;
}

/**
 * The language the customer app and in-app updates use (PRD 5.1), kept on the customer
 * record. The customer sets it in the app; staff can set it on the customer page.
 * WhatsApp templates stay in their approved language until Meta approves the others.
 */
@Injectable()
export class CustomerLanguageService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** The customer's own choice. A family member's choice stays on their phone. */
  async setOwn(who: Signed, language: CustomerLanguage): Promise<{ language: CustomerLanguage }> {
    if (who.contactId) throw forbidden('Only the account holder can change this.');
    await this.write(who.customerId, language);
    return { language };
  }

  async get(actor: Actor, customerId: string): Promise<CustomerLanguageView> {
    assertCan(actor, 'customers.view', 'customers.manage');
    return { customerId, language: await this.read(customerId) };
  }

  async set(
    actor: Actor,
    customerId: string,
    language: CustomerLanguage,
  ): Promise<CustomerLanguageView> {
    assertCan(actor, 'customers.manage');
    const before = await this.read(customerId);
    if (before !== language) {
      await this.db.transaction(async (tx) => {
        await this.write(customerId, language, tx);
        await recordAudit(tx, actor.userId, 'customer.language_changed', 'customer', customerId, {
          from: before,
          to: language,
        });
      });
    }
    return { customerId, language };
  }

  private async read(customerId: string): Promise<CustomerLanguage> {
    const [row] = await this.db
      .select({ language: customers.preferredLanguage })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!row) throw notFound('That customer');
    return customerLanguage(row.language);
  }

  private async write(
    customerId: string,
    language: CustomerLanguage,
    db: DatabaseExecutor = this.db,
  ): Promise<void> {
    const updated = await db
      .update(customers)
      .set({ preferredLanguage: language, updatedAt: new Date() })
      .where(eq(customers.id, customerId))
      .returning({ id: customers.id });
    if (updated.length === 0) throw notFound('That customer');
  }
}
