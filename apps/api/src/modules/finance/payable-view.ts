import type { Payable } from '@oneohm/api-contracts';
import type { payables } from '@oneohm/database';
import { billToPay, matchVendorInvoice } from '@oneohm/domain';

type Row = typeof payables.$inferSelect;

/**
 * A bill as finance sees it: what it is for, where approval and payment stand, the
 * vendor's invoice against the order, and the TDS held back from the payee.
 */
export function presentPayable(
  row: Row,
  code: string | null,
  approver: string | null,
  today: string,
): Payable {
  return {
    id: row.id,
    projectId: row.projectId,
    projectCode: code,
    party: row.party,
    partyName: row.partyName,
    description: row.description,
    billNumber: row.billNumber,
    amountPaise: row.amountPaise,
    dueOn: row.dueOn,
    status: row.status,
    overdue: row.status !== 'paid' && row.dueOn < today,
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
    toPayPaise: billToPay(row),
  };
}
