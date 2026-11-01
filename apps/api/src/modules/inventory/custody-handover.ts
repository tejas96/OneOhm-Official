import type { Dispatch } from '@oneohm/api-contracts';
import type { products, Transaction } from '@oneohm/database';
import { quoteMaterial, resolveLineKey } from './custody-reconcile';
import { addSlipLines, lockCustody, openSlip } from './custody-write';

/**
 * A delivery challan the contractor's crew took at site: everything on it is now with
 * them, recorded as an issue slip that points at the challan. The store movement is the
 * dispatch itself, so stock is not moved twice.
 */
export async function handOverDispatch(
  tx: Transaction,
  input: {
    readonly contractorId: string;
    readonly projectId: string;
    readonly locationId: string;
    readonly dispatch: { readonly id: string; readonly on: string };
    readonly lines: Dispatch['lines'];
    readonly catalog: readonly (typeof products.$inferSelect)[];
    readonly userId: string;
  },
): Promise<string> {
  await lockCustody(tx, input.contractorId, input.projectId);
  const quote = await quoteMaterial(tx, input.projectId);
  const slip = await openSlip(tx, {
    kind: 'issue',
    contractorId: input.contractorId,
    projectId: input.projectId,
    locationId: input.locationId,
    dispatchId: input.dispatch.id,
    occurredOn: input.dispatch.on,
    note: null,
    userId: input.userId,
  });
  await addSlipLines(
    tx,
    slip.id,
    input.lines.map((line) => {
      const product = input.catalog.find((row) => row.id === line.productId);
      return {
        productId: line.productId,
        lineKey: product ? resolveLineKey(quote, product, null) : null,
        quantity: line.quantity,
        serials: line.serials,
      };
    }),
  );
  return slip.number;
}
