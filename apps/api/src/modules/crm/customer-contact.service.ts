import { Inject, Injectable } from '@nestjs/common';
import type { CustomerContact, Handover } from '@oneohm/api-contracts';
import { customerActions, customerHandovers, customers, projects, users } from '@oneohm/database';
import {
  type Capability,
  type ContactChannel,
  inPersonClose,
  rightsForAsk,
  routeFor,
} from '@oneohm/domain';
import { and, desc, eq, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { closePlain } from '../documents/document-request-in-person';
import { readRequests } from '../documents/document-request-read';
import { paperFor } from './handover-paper';

/** WhatsApp first, SMS second, in person last (owner's rule), per customer. */
@Injectable()
export class CustomerContactService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(actor: Actor, customerId: string): Promise<CustomerContact> {
    assertCan(actor, 'customers.view', 'customers.manage');
    const [row] = await this.db
      .select({
        phone: customers.phoneE164,
        channel: customers.contactChannel,
        unreachable: customers.whatsappUnreachableAt,
        optIn: customers.whatsappOptIn,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!row) throw notFound('That customer');
    return {
      customerId,
      phone: row.phone,
      channel: row.channel,
      whatsappUnreachableAt: row.unreachable?.toISOString() ?? null,
      whatsappOptIn: row.optIn,
      route: routeFor({
        channel: row.channel,
        whatsappUnreachable: row.unreachable !== null,
        whatsappOptIn: row.optIn,
      }),
    };
  }

  async set(
    actor: Actor,
    customerId: string,
    patch: { channel?: ContactChannel | undefined; tryWhatsAppAgain?: boolean | undefined },
  ): Promise<CustomerContact> {
    assertCan(actor, 'customers.manage');
    await this.db.transaction(async (tx) => {
      await tx
        .update(customers)
        .set({
          ...(patch.channel ? { contactChannel: patch.channel } : {}),
          ...(patch.tryWhatsAppAgain ? { whatsappUnreachableAt: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(customers.id, customerId));
      await recordAudit(
        tx,
        actor.userId,
        'customer.contact_changed',
        'customer',
        customerId,
        patch,
      );
    });
    return this.get(actor, customerId);
  }

  async handovers(
    actor: Actor,
    query: { customerId?: string | undefined; status: 'open' | 'done' },
  ): Promise<Handover[]> {
    assertCan(actor, 'customers.view', 'customers.manage');
    const conditions: SQL[] = [
      query.status === 'open'
        ? isNull(customerHandovers.doneAt)
        : isNotNull(customerHandovers.doneAt),
    ];
    if (query.customerId) conditions.push(eq(customerHandovers.customerId, query.customerId));
    return this.read(and(...conditions));
  }

  async complete(actor: Actor, id: string, note: string | undefined): Promise<Handover> {
    assertCan(actor, 'customers.manage');
    await this.db.transaction(async (tx) => {
      const done = await tx
        .update(customerHandovers)
        .set({ doneAt: new Date(), doneByUserId: actor.userId, note: note?.trim() || null })
        .where(and(eq(customerHandovers.id, id), isNull(customerHandovers.doneAt)))
        .returning({ id: customerHandovers.id, actionId: customerHandovers.actionId });
      if (done.length > 0) {
        await recordAudit(tx, actor.userId, 'handover.done', 'customer_handover', id, { note });
        // The ask it was about is done too (a plain one; the rest wait for their own step).
        const [ask] = done[0]?.actionId
          ? await readRequests(tx, eq(customerActions.id, done[0].actionId), true)
          : [];
        if (ask?.status === 'open' && inPersonClose(ask.type, ask.kind).how === 'plain') {
          // The same right as closing the ask itself in person; without it nothing changes (rolled back).
          if (!rightsForAsk(ask.type).some((right) => can(actor, right as Capability)))
            throw forbidden();
          await closePlain(tx, actor.userId, ask);
        }
      }
    });
    const [row] = await this.read(eq(customerHandovers.id, id));
    if (!row) throw notFound('That item');
    return row;
  }

  private async read(where: SQL | undefined): Promise<Handover[]> {
    const rows = await this.db
      .select({
        item: customerHandovers,
        customer: customers.name,
        phone: customers.phoneE164,
        code: projects.code,
        doneBy: users.fullName,
      })
      .from(customerHandovers)
      .innerJoin(customers, eq(customers.id, customerHandovers.customerId))
      .leftJoin(projects, eq(projects.id, customerHandovers.projectId))
      .leftJoin(users, eq(users.id, customerHandovers.doneByUserId))
      .where(where)
      .orderBy(desc(customerHandovers.createdAt))
      .limit(200);
    const papers = await Promise.all(
      rows.map(({ item }) => paperFor(this.db, item.template, item.dedupeKey)),
    );
    return rows.map(({ item, ...row }, index) => ({
      id: item.id,
      customerId: item.customerId,
      customer: row.customer,
      phone: row.phone,
      projectId: item.projectId,
      projectCode: row.code,
      title: item.title,
      body: item.body,
      createdAt: item.createdAt.toISOString(),
      doneAt: item.doneAt?.toISOString() ?? null,
      doneBy: row.doneBy,
      note: item.note,
      printPath: papers[index] ?? null,
    }));
  }
}
