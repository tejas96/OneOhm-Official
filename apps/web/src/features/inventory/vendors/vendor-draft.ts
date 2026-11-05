import type { Vendor, VendorInput } from '@oneohm/api-contracts';
import { panFromGstin } from '@oneohm/domain';
import { type BankValues, bankBody, EMPTY_BANK } from './bank-check';

export interface Draft extends BankValues {
  name: string;
  gstin: string;
  pan: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  paymentTermsDays: string;
  notes: string;
  active: boolean;
  productIds: string[];
}

export const BLANK: Draft = {
  ...EMPTY_BANK,
  name: '',
  gstin: '',
  pan: '',
  contactName: '',
  phone: '',
  email: '',
  address: '',
  paymentTermsDays: '30',
  notes: '',
  active: true,
  productIds: [],
};

export const draftFrom = (vendor: Vendor): Draft => ({
  name: vendor.name,
  gstin: vendor.gstin ?? '',
  // No PAN saved but a GSTIN: its PAN is offered, and saved with the form.
  pan: vendor.pan ?? panFromGstin(vendor.gstin),
  contactName: vendor.contactName ?? '',
  phone: vendor.phone ?? '',
  email: vendor.email ?? '',
  address: vendor.address ?? '',
  paymentTermsDays: String(vendor.paymentTermsDays),
  ...EMPTY_BANK,
  bankAccountName: vendor.bankAccountName ?? '',
  bankIfsc: vendor.bankIfsc ?? '',
  notes: vendor.notes ?? '',
  active: vendor.active,
  productIds: [...vendor.productIds],
});

/** The GSTIN changed: fill the PAN from it, unless the person typed a different one. */
export function withGstin(draft: Draft, gstin: string): Draft {
  const wasFilled = draft.pan === '' || draft.pan === panFromGstin(draft.gstin);
  return { ...draft, gstin, pan: wasFilled ? panFromGstin(gstin) : draft.pan };
}

export function vendorBody(draft: Draft): VendorInput {
  const { bankAccountName, bankIfsc, bankAccountNumber, bankAccountNumberConfirm, ...rest } = draft;
  return {
    ...rest,
    paymentTermsDays: Number(draft.paymentTermsDays || 0),
    ...bankBody({ bankAccountName, bankIfsc, bankAccountNumber, bankAccountNumberConfirm }),
  };
}
