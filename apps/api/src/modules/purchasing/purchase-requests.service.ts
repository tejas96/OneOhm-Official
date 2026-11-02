import { Inject, Injectable } from '@nestjs/common';
import type {
  PurchaseOrderData,
  PurchaseRequest,
  PurchaseRequestData,
  PurchaseRequestStatus,
  RequestOrderInput,
} from '@oneohm/api-contracts';
import {
  notifyHolders,
  products,
  projects,
  purchaseRequestLines,
  purchaseRequests,
  type Transaction,
} from '@oneohm/database';
import { asUnit, canStepRequest, type PurchaseRequestStep } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { checkOrderInput, insertOrder } from '../inventory/purchase-orders.service';
import { nextNumber } from '../inventory/stock-ledger';
import { purchaseRequestRow, purchaseRequestRows } from './purchase-request-read';
import { tellRequester } from './purchasing-notices';

const STEP_DONE: Readonly<Record<PurchaseRequestStep, string>> = {
  approve: 'approved',
  reject: 'rejected',
  order: 'ordered',
  cancel: 'cancelled',
};

/** Purchase requests (PRD 3.10): raised by anyone who needs material, decided by procurement. */
@Injectable()
export class PurchaseRequestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(filter: { status?: PurchaseRequestStatus | undefined; projectId?: string | undefined }) {
    const conditions: SQL[] = [];
    if (filter.status) conditions.push(eq(purchaseRequests.status, filter.status));
    if (filter.projectId) conditions.push(eq(purchaseRequests.projectId, filter.projectId));
    return purchaseRequestRows(this.db, conditions.length ? and(...conditions) : undefined);
  }

  get(id: string): Promise<PurchaseRequest> {
    return purchaseRequestRow(this.db, id);
  }

  async create(actor: Actor, input: PurchaseRequestData): Promise<PurchaseRequest> {
    const project = await this.checkRequest(input);
    const today = todayIn();
    const id = await this.db.transaction(async (tx) => {
      const number = await nextNumber(tx, 'purchase_requests', 'PR', today);
      const [row] = await tx
        .insert(purchaseRequests)
        .values({
          number,
          projectId: input.projectId,
          reason: input.reason,
          requestedByUserId: actor.userId,
        })
        .returning({ id: purchaseRequests.id });
      if (!row) throw new Error('Purchase request insert returned nothing.');
      await tx
        .insert(purchaseRequestLines)
        .values(input.lines.map((line, position) => ({ ...line, requestId: row.id, position })));
      await recordAudit(tx, actor.userId, 'purchase_request.created', 'purchase_request', row.id, {
        number,
        lines: input.lines.length,
      });
      const items = input.lines.length === 1 ? '1 item' : `${input.lines.length} items`;
      await notifyHolders(
        tx,
        'procurement.manage',
        {
          kind: 'purchase_request',
          title: `New purchase request ${number}`,
          body: `${actor.fullName} asks for ${items} ${project ? `for ${project.code}` : 'for stock'}: ${input.reason}`,
          subject: { type: 'purchase_request', id: row.id, projectId: input.projectId },
          dedupeKey: `purchase_request:${row.id}:new`,
        },
        actor.userId,
      );
      return row.id;
    });
    return this.get(id);
  }

  approve(actor: Actor, id: string, note: string | null): Promise<PurchaseRequest> {
    return this.decide(actor, id, 'approve', note);
  }

  reject(actor: Actor, id: string, note: string): Promise<PurchaseRequest> {
    return this.decide(actor, id, 'reject', note);
  }

  async cancel(actor: Actor, id: string): Promise<PurchaseRequest> {
    await this.db.transaction(async (tx) => {
      const request = await this.lock(tx, id, 'cancel');
      if (request.requestedByUserId !== actor.userId && !can(actor, 'procurement.manage')) {
        throw forbidden('Only the person who raised it or procurement can cancel this request.');
      }
      await tx
        .update(purchaseRequests)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(purchaseRequests.id, id));
      await recordAudit(tx, actor.userId, 'purchase_request.cancelled', 'purchase_request', id);
      await tellRequester(tx, actor, request, 'cancelled', null);
    });
    return this.get(id);
  }

  /** An approved request becomes a draft purchase order with the vendor's rates. */
  async order(actor: Actor, id: string, input: RequestOrderInput): Promise<PurchaseRequest> {
    const request = await this.get(id);
    if (!canStepRequest(request.status, 'order')) {
      throw conflict(`This request is ${request.status}; only an approved one can be ordered.`);
    }
    const order = toOrder(request, input);
    await checkOrderInput(this.db, order);
    await this.db.transaction(async (tx) => {
      const row = await this.lock(tx, id, 'order');
      const created = await insertOrder(tx, actor, order);
      await tx
        .update(purchaseRequests)
        .set({ status: 'ordered', purchaseOrderId: created.id, updatedAt: new Date() })
        .where(eq(purchaseRequests.id, id));
      await recordAudit(tx, actor.userId, 'purchase_request.ordered', 'purchase_request', id, {
        purchaseOrder: created.number,
      });
      await tellRequester(tx, actor, row, 'ordered', `On order as ${created.number}.`);
    });
    return this.get(id);
  }

  private async decide(
    actor: Actor,
    id: string,
    step: 'approve' | 'reject',
    note: string | null,
  ): Promise<PurchaseRequest> {
    await this.db.transaction(async (tx) => {
      const request = await this.lock(tx, id, step);
      await tx
        .update(purchaseRequests)
        .set({
          status: step === 'approve' ? 'approved' : 'rejected',
          decidedByUserId: actor.userId,
          decidedAt: new Date(),
          decisionNote: note,
          updatedAt: new Date(),
        })
        .where(eq(purchaseRequests.id, id));
      await recordAudit(
        tx,
        actor.userId,
        `purchase_request.${STEP_DONE[step]}`,
        'purchase_request',
        id,
        {
          note,
        },
      );
      await tellRequester(tx, actor, request, step === 'approve' ? 'approved' : 'rejected', note);
    });
    return this.get(id);
  }

  private async lock(tx: Transaction, id: string, step: PurchaseRequestStep) {
    const [request] = await tx
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.id, id))
      .for('update');
    if (!request) throw notFound('That purchase request');
    if (!canStepRequest(request.status, step)) {
      throw conflict(`This request is already ${request.status}.`, 'request_state');
    }
    return request;
  }

  private async checkRequest(input: PurchaseRequestData) {
    const errors: Record<string, string> = {};
    const today = todayIn();
    for (const [index, line] of input.lines.entries()) {
      if (line.neededBy < today) errors[`lines.${index}.neededBy`] = 'Pick today or a later date.';
    }
    const ids = [...new Set(input.lines.map((line) => line.productId))];
    if (ids.length !== input.lines.length) errors.lines = 'Each item can appear once.';
    const found = await this.db
      .select({ id: products.id, active: products.active })
      .from(products)
      .where(inArray(products.id, ids));
    for (const [index, line] of input.lines.entries()) {
      if (!found.some((row) => row.id === line.productId && row.active)) {
        errors[`lines.${index}.productId`] = 'Pick an item from the catalog.';
      }
    }
    if (Object.keys(errors).length > 0) throw invalid('Some lines need fixing.', errors);
    if (!input.projectId) return null;
    const [project] = await this.db
      .select({ id: projects.id, code: projects.code })
      .from(projects)
      .where(eq(projects.id, input.projectId));
    if (!project) throw invalid('That project was not found.', { projectId: 'Pick a project.' });
    return project;
  }
}

/** The draft order for a request: every line once, at the rates procurement agreed. */
function toOrder(request: PurchaseRequest, input: RequestOrderInput): PurchaseOrderData {
  const rates = new Map(input.lines.map((line) => [line.lineId, line] as const));
  if (rates.size !== input.lines.length || request.lines.some((line) => !rates.has(line.id))) {
    throw invalid('Give a rate for every line on the request.');
  }
  return {
    vendorId: input.vendorId,
    projectId: request.project?.id ?? null,
    orderDate: input.orderDate,
    expectedOn: input.expectedOn,
    notes: `From purchase request ${request.number}: ${request.reason}`.slice(0, 1000),
    lines: request.lines.map((line) => {
      const rate = rates.get(line.id);
      return {
        productId: line.productId,
        description: line.name,
        unit: asUnit(line.unit),
        quantity: line.quantity,
        ratePaise: rate?.ratePaise ?? line.costPaise,
        taxRateBp: rate?.taxRateBp ?? line.taxRateBp,
      };
    }),
  };
}
