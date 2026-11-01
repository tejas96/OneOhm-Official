import { Inject, Injectable } from '@nestjs/common';
import type { FamilyMember, NewFamilyMember } from '@oneohm/api-contracts';
import { customerContacts, customerSessions, customers } from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { familyOf } from './customer-family';

/** A customer may let this many people into their app. */
const MAX_FAMILY = 5;

interface Signed {
  readonly customerId: string;
  readonly contactId: string | null;
}

/** Family access (PRD 5.1). Only the customer changes it; a family member only reads it. */
@Injectable()
export class CustomerFamilyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(who: Signed): Promise<FamilyMember[]> {
    return familyOf(this.db, who.customerId);
  }

  async add(who: Signed, input: NewFamilyMember): Promise<FamilyMember[]> {
    this.onlyCustomer(who);
    const [customer] = await this.db
      .select({ phone: customers.phoneE164 })
      .from(customers)
      .where(eq(customers.id, who.customerId));
    if (customer?.phone === input.phone) {
      throw invalid('That is your own number.', { phone: 'Enter the family member’s mobile.' });
    }
    const current = await familyOf(this.db, who.customerId);
    if (current.length >= MAX_FAMILY) {
      throw conflict(`You can add up to ${MAX_FAMILY} people.`, 'too_many');
    }
    await this.db
      .insert(customerContacts)
      .values({
        customerId: who.customerId,
        name: input.name.trim(),
        phoneE164: input.phone,
        relation: input.relation?.trim() ?? '',
      })
      .onConflictDoUpdate({
        target: [customerContacts.customerId, customerContacts.phoneE164],
        set: { name: input.name.trim(), relation: input.relation?.trim() ?? '', revokedAt: null },
      });
    return familyOf(this.db, who.customerId);
  }

  async remove(who: Signed, id: string): Promise<FamilyMember[]> {
    this.onlyCustomer(who);
    const now = new Date();
    const removed = await this.db
      .update(customerContacts)
      .set({ revokedAt: now })
      .where(
        and(
          eq(customerContacts.id, id),
          eq(customerContacts.customerId, who.customerId),
          isNull(customerContacts.revokedAt),
        ),
      )
      .returning({ id: customerContacts.id });
    if (removed.length === 0) throw notFound('That family member');
    // Their phones are signed out straight away.
    await this.db
      .update(customerSessions)
      .set({ revokedAt: now })
      .where(and(eq(customerSessions.contactId, id), isNull(customerSessions.revokedAt)));
    return familyOf(this.db, who.customerId);
  }

  private onlyCustomer(who: Signed): void {
    if (who.contactId) throw forbidden('Only the account holder can change family access.');
  }
}
