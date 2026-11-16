import type { Payable } from '@oneohm/api-contracts';
import type { payables } from '@oneohm/database';
import { billToPay, leftToPay, matchVendorInvoice } from '@oneohm/domain';

type Row = typeof payables.$inferSelect;

/**
 * A bill as finance sees it: what it is for, where approval and payment stand, the
 * vendor's invoice against the order, and the TDS held back from the payee. The project is
 * the bill's own, or, for an approved travel claim, the claim's (joined, not copied).
 */
export function presentPayable(
  row: Row,
  project: { id: string | null; code: string | null },
  approver: string | null,
  today: string,
): Payable {
  return {
    id: row.id,
    projectId: project.id,
    projectCode: project.code,
    party: row.party,
    partyName: row.partyName,
    description: row.description,
    billNumber: row.billNumber,
    amountPaise: row.amountPaise,
    dueOn: row.dueOn,
    status: row.status,
    overdue: (row.status === 'pending' || row.status === 'approved') && row.dueOn < today,
    approvedBy:
      row.approvedByUserId && approver ? { id: row.approvedByUserId, fullName: approver } : null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    paidOn: row.paidOn,
    paidMethod: row.paidMethod,
    paidReference: row.paidReference,
    createdAt: row.createdAt.toISOString(),
    advanceAdjustedPaise: row.advanceAdjustedPaise,
    vendorInvoicePaise: row.vendorInvoicePaise,
    invoiceMatch: matchVendorInvoice({
      expectedPaise: row.amountPaise,
      invoicePaise: row.vendorInvoicePaise,
    }),
    gstPaise: row.gstPaise,
    tdsBp: row.tdsBp,
    tdsPaise: row.tdsPaise,
    toPayPaise: row.status === 'cancelled' ? 0 : billToPay(row),
    paidPaise: row.paidPaise,
    leftPaise: row.status === 'cancelled' ? 0 : leftToPay(row),
  };
}
