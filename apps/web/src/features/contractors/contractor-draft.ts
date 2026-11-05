import type { ContractorDetail, ContractorInput } from '@oneohm/api-contracts';
import { bankBody } from '@/features/inventory/vendors/bank-check';

export interface ContractorDraft {
  readonly name: string;
  readonly kind: 'company' | 'individual';
  readonly contactName: string;
  readonly phone: string;
  readonly email: string;
  readonly gstin: string;
  readonly pan: string;
  readonly address: string;
  readonly bankAccountName: string;
  readonly bankAccountNumber: string;
  readonly bankAccountNumberConfirm: string;
  readonly bankIfsc: string;
  readonly paymentTermsDays: number | null;
  readonly tdsBp: number | null;
  readonly retentionBp: number | null;
  readonly retentionDays: number | null;
  readonly skills: readonly string[];
  readonly serviceAreas: string;
  readonly notes: string;
}

export const EMPTY_CONTRACTOR: ContractorDraft = {
  name: '',
  kind: 'company',
  contactName: '',
  phone: '',
  email: '',
  gstin: '',
  pan: '',
  address: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankAccountNumberConfirm: '',
  bankIfsc: '',
  paymentTermsDays: 15,
  tdsBp: 100,
  retentionBp: 0,
  retentionDays: 90,
  skills: ['ic_partner'],
  serviceAreas: '',
  notes: '',
};

export function draftFrom(contractor: ContractorDetail): ContractorDraft {
  return {
    name: contractor.name,
    kind: contractor.kind,
    contactName: contractor.contactName ?? '',
    phone: contractor.phone?.replace(/^\+91/, '') ?? '',
    email: contractor.email ?? '',
    gstin: contractor.gstin ?? '',
    pan: contractor.pan ?? '',
    address: contractor.address ?? '',
    bankAccountName: contractor.bankAccountName ?? '',
    // Write-only: the saved number is never sent to the browser.
    bankAccountNumber: '',
    bankAccountNumberConfirm: '',
    bankIfsc: contractor.bankIfsc ?? '',
    paymentTermsDays: contractor.paymentTermsDays,
    tdsBp: contractor.tdsBp,
    retentionBp: contractor.retentionBp,
    retentionDays: contractor.retentionDays,
    skills: contractor.skills,
    serviceAreas: contractor.serviceAreas.join(', '),
    notes: contractor.notes ?? '',
  };
}

const orNull = (value: string) => (value.trim() ? value.trim() : null);

/** Blank name or IFSC clears; the number and its second typing go only when a new one is typed. */
function bankFields(draft: ContractorDraft) {
  const body = bankBody(draft);
  return {
    ...body,
    bankAccountName: orNull(body.bankAccountName),
    bankIfsc: orNull(body.bankIfsc),
  };
}

/** The API body; blank optional fields are sent as null so they clear. */
export function contractorBody(draft: ContractorDraft): ContractorInput {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    contactName: orNull(draft.contactName),
    phone: orNull(draft.phone),
    email: orNull(draft.email),
    gstin: orNull(draft.gstin),
    pan: orNull(draft.pan),
    address: orNull(draft.address),
    ...bankFields(draft),
    paymentTermsDays: draft.paymentTermsDays ?? 0,
    tdsBp: draft.tdsBp ?? 0,
    retentionBp: draft.retentionBp ?? 0,
    retentionDays: draft.retentionDays ?? 0,
    skills: [...draft.skills],
    serviceAreas: draft.serviceAreas
      .split(',')
      .map((area) => area.trim())
      .filter(Boolean),
    notes: orNull(draft.notes),
  };
}
