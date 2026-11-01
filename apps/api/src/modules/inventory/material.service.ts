import { Inject, Injectable } from '@nestjs/common';
import type { Dispatch, DispatchData, ProjectMaterial } from '@oneohm/api-contracts';
import { dispatches, projectActivities, stockReservations, stockSerials } from '@oneohm/database';
import { isSerialised } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { projectMaterial, projectNeeds } from './material-read';
import {
  activeReservations,
  assertCovered,
  holdSerials,
  outstandingNeeds,
} from './reservation-helpers';
import { moveStock, nextNumber, resolveLocation, suggestFacts } from './stock-ledger';

/**
 * A project's material from the store: reserve what the accepted quotation needs (all
 * or nothing), release it, or dispatch everything reserved on one delivery challan.
 */
@Injectable()
export class MaterialService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  get(projectId: string): Promise<ProjectMaterial> {
    return projectMaterial(this.db, projectId);
  }

  async reserve(actor: Actor, projectId: string, locationId: string | null) {
    await this.db.transaction(async (tx) => {
      const location = await resolveLocation(tx, locationId);
      const { needs, catalog } = await projectNeeds(tx, projectId);
      const outstanding = await outstandingNeeds(tx, projectId, needs);
      if (outstanding.length === 0) throw conflict('Everything this project needs is reserved.');
      await assertCovered(tx, location, outstanding, catalog);

      for (const need of outstanding) {
        const product = catalog.find((row) => row.id === need.productId);
        if (!product) continue;
        const [reservation] = await tx
          .insert(stockReservations)
          .values({
            projectId,
            productId: product.id,
            locationId: location.id,
            quantity: need.quantity,
            createdByUserId: actor.userId,
          })
          .returning({ id: stockReservations.id });
        await moveStock(tx, {
          productId: product.id,
          label: product.name,
          locationId: location.id,
          kind: 'reservation',
          onHand: 0,
          reserved: need.quantity,
          projectId,
          referenceId: reservation?.id ?? null,
          userId: actor.userId,
        });
        if (isSerialised(product.category)) {
          await holdSerials(
            tx,
            { productId: product.id, locationId: location.id, projectId },
            need.quantity,
          );
        }
      }
      const summary = await projectMaterial(tx, projectId);
      await suggestFacts(tx, projectId, summary.facts);
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'material',
        message: `Material reserved in ${location.name}.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'material.reserved', 'project', projectId, {
        lines: outstanding,
      });
    });
    return this.get(projectId);
  }

  async release(actor: Actor, projectId: string) {
    await this.db.transaction(async (tx) => {
      const active = await activeReservations(tx, projectId);
      if (active.length === 0) throw conflict('Nothing is reserved for this project.');
      for (const row of active) {
        await moveStock(tx, {
          productId: row.productId,
          label: 'this item',
          locationId: row.locationId,
          kind: 'release',
          onHand: 0,
          reserved: -row.quantity,
          projectId,
          referenceId: row.id,
          userId: actor.userId,
        });
      }
      await tx
        .update(stockReservations)
        .set({ status: 'released', updatedAt: new Date() })
        .where(
          inArray(
            stockReservations.id,
            active.map((row) => row.id),
          ),
        );
      await tx
        .update(stockSerials)
        .set({ status: 'in_stock', projectId: null, updatedAt: new Date() })
        .where(and(eq(stockSerials.projectId, projectId), eq(stockSerials.status, 'reserved')));
      await recordAudit(tx, actor.userId, 'material.released', 'project', projectId);
    });
    return this.get(projectId);
  }

  async dispatch(actor: Actor, projectId: string, input: DispatchData) {
    await this.db.transaction(async (tx) => {
      const active = await activeReservations(tx, projectId);
      if (active.length === 0) throw conflict('Reserve the material before dispatching it.');
      const { catalog } = await projectNeeds(tx, projectId);
      const locationId = active[0]?.locationId ?? '';
      const number = await nextNumber(tx, 'dispatches', 'DC', input.dispatchedOn);
      const [dispatch] = await tx
        .insert(dispatches)
        .values({
          ...input,
          number,
          projectId,
          locationId,
          lines: [],
          createdByUserId: actor.userId,
        })
        .returning({ id: dispatches.id });
      if (!dispatch) throw new Error('Dispatch insert returned nothing.');
      const lines: Dispatch['lines'] = [];
      for (const row of active) {
        const product = catalog.find((entry) => entry.id === row.productId);
        await moveStock(tx, {
          productId: row.productId,
          label: product?.name ?? 'this item',
          locationId: row.locationId,
          kind: 'dispatch',
          onHand: -row.quantity,
          reserved: -row.quantity,
          projectId,
          referenceId: dispatch.id,
          note: number,
          userId: actor.userId,
        });
        const serials = await tx
          .update(stockSerials)
          .set({ status: 'dispatched', dispatchId: dispatch.id, updatedAt: new Date() })
          .where(
            and(
              eq(stockSerials.projectId, projectId),
              eq(stockSerials.productId, row.productId),
              eq(stockSerials.status, 'reserved'),
            ),
          )
          .returning({ serial: stockSerials.serial });
        lines.push({
          productId: row.productId,
          name: product?.name ?? 'Item',
          unit: product?.unit ?? 'nos',
          quantity: row.quantity,
          serials: serials.map((entry) => entry.serial).sort(),
        });
      }
      await tx.update(dispatches).set({ lines }).where(eq(dispatches.id, dispatch.id));
      await tx
        .update(stockReservations)
        .set({ status: 'dispatched', updatedAt: new Date() })
        .where(
          inArray(
            stockReservations.id,
            active.map((row) => row.id),
          ),
        );
      await tx.insert(projectActivities).values({
        projectId,
        kind: 'material',
        message: `Material dispatched to site on ${number}.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'material.dispatched', 'project', projectId, { number });
    });
    return this.get(projectId);
  }
}
