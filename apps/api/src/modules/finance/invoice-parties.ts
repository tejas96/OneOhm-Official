import type { TaxInvoice } from '@oneohm/api-contracts';
import { type customerInvoices, type DatabaseExecutor, users } from '@oneohm/database';
import { stateLabel } from '@oneohm/domain';
import { inArray } from 'drizzle-orm';
import { formatPhone } from '../reports/quotation-document';
import type { InvoiceSource } from './invoice-source';

/** Seller, buyer and site exactly as printed on the invoice (kept with it). */
export interface InvoiceParties {
  readonly seller: {
    readonly name: string;
    readonly brand: string;
    readonly address: string;
    readonly gstin: string;
    readonly state: string;
    readonly email: string;
    readonly phones: string;
    readonly signatory: string;
    readonly designation: string;
  };
  readonly buyer: {
    readonly name: string;
    readonly phone: string;
    readonly email: string | null;
    readonly address: string;
  };
  readonly quotation: { readonly number: string; readonly revision: number };
  readonly subsidyPaise: number;
}

const joined = (...parts: (string | null | undefined)[]) =>
  parts.filter((part) => part && part.trim() !== '').join(', ');

export function partiesOf(source: InvoiceSource): InvoiceParties {
  const { company, customer, property, quotation, supplier } = source;
  return {
    seller: {
      name: company?.legalName ?? '',
      brand: company?.brandName ?? '',
      address: company?.fullAddress ?? '',
      gstin: company?.gstin ?? '',
      state: supplier ? stateLabel(supplier) : '',
      email: company?.email ?? '',
      phones: company?.phones.join(' · ') ?? '',
      signatory: company?.signatoryName ?? '',
      designation: company?.signatoryDesignation ?? '',
    },
    buyer: {
      name: customer.name,
      phone: formatPhone(customer.phoneE164),
      email: customer.email,
      address: joined(
        property.addressLine,
        property.city,
        property.district,
        property.state,
        property.pincode,
      ),
    },
    quotation: { number: quotation.number, revision: quotation.revision },
    subsidyPaise: quotation.subsidyPaise,
  };
}

type InvoiceRow = typeof customerInvoices.$inferSelect;

/** Invoice rows as the API shows them, with who issued them and what they replace. */
export async function presentInvoices(
  db: DatabaseExecutor,
  rows: readonly { invoice: InvoiceRow; projectCode: string; customerName: string }[],
  related: readonly Pick<InvoiceRow, 'id' | 'number' | 'replacesInvoiceId'>[],
): Promise<TaxInvoice[]> {
  const userIds = [
    ...new Set(rows.map((row) => row.invoice.issuedByUserId).filter((id) => id !== null)),
  ];
  const people = userIds.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, userIds))
    : [];
  return rows.map(({ invoice, projectCode, customerName }) => ({
    id: invoice.id,
    number: invoice.number,
    projectId: invoice.projectId,
    projectCode,
    customerName,
    invoiceDate: invoice.invoiceDate,
    status: invoice.status,
    supply: invoice.supply,
    placeOfSupply: `${invoice.placeOfSupplyCode}-${invoice.placeOfSupplyState}`,
    customerGstin: invoice.customerGstin,
    taxablePaise: invoice.taxablePaise,
    cgstPaise: invoice.cgstPaise,
    sgstPaise: invoice.sgstPaise,
    igstPaise: invoice.igstPaise,
    totalPaise: invoice.totalPaise,
    scheduleTotalPaise: invoice.scheduleTotalPaise,
    differencePaise: invoice.totalPaise - invoice.scheduleTotalPaise,
    cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
    cancelReason: invoice.cancelReason,
    replacesNumber: related.find((other) => other.id === invoice.replacesInvoiceId)?.number ?? null,
    replacedByNumber:
      related.find((other) => other.replacesInvoiceId === invoice.id)?.number ?? null,
    issuedBy: people.find((person) => person.id === invoice.issuedByUserId) ?? null,
    createdAt: invoice.createdAt.toISOString(),
  }));
}
