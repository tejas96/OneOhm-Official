'use client';

import type { IfscBranch } from '@oneohm/api-contracts';
import {
  type BankField,
  type BankProblem,
  bankProblems,
  cleanAccountNumber,
  cleanIfsc,
  ifscProblem,
} from '@oneohm/domain';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/api-client';

/** What the bank fields of a vendor, contractor or Pay-dialog form hold. */
export interface BankValues {
  readonly bankAccountName: string;
  readonly bankIfsc: string;
  /** Empty keeps the saved number; typing a new one replaces it. */
  readonly bankAccountNumber: string;
  readonly bankAccountNumberConfirm: string;
}

export const EMPTY_BANK: BankValues = {
  bankAccountName: '',
  bankIfsc: '',
  bankAccountNumber: '',
  bankAccountNumberConfirm: '',
};

export const BANK_KEY: Record<BankField, keyof BankValues> = {
  name: 'bankAccountName',
  ifsc: 'bankIfsc',
  number: 'bankAccountNumber',
  confirm: 'bankAccountNumberConfirm',
};

/** Every problem with what is typed, by field (the same rules the server applies). */
export const bankDraftProblems = (values: BankValues): Partial<Record<BankField, BankProblem>> =>
  bankProblems({
    name: values.bankAccountName,
    ifsc: values.bankIfsc,
    number: values.bankAccountNumber,
    confirm: values.bankAccountNumberConfirm,
  });

/**
 * The bank part of a save body. A blank name or IFSC is sent blank (it clears); the number
 * and its second typing go only when a new number was typed.
 */
export function bankBody(values: BankValues) {
  const number = cleanAccountNumber(values.bankAccountNumber);
  return {
    bankAccountName: values.bankAccountName.trim(),
    bankIfsc: cleanIfsc(values.bankIfsc),
    ...(number
      ? {
          bankAccountNumber: number,
          bankAccountNumberConfirm: cleanAccountNumber(values.bankAccountNumberConfirm),
        }
      : {}),
  };
}

export type IfscState =
  | { readonly kind: 'idle' | 'checking' | 'not_found' | 'unavailable' }
  | { readonly kind: 'found'; readonly branch: IfscBranch };

const DAY_MS = 86_400_000;

/** Which bank branch the IFSC belongs to, asked once the 11 characters are valid. */
export function useIfscLookup(ifsc: string): IfscState {
  const code = cleanIfsc(ifsc);
  const ready = code.length === 11 && ifscProblem(code) === null;
  const query = useQuery({
    queryKey: ['banking', 'ifsc', code],
    enabled: ready,
    retry: false,
    // A branch or a "no such IFSC" is kept; a service that was down is asked again soon.
    staleTime: (q) => (q.state.data?.kind === 'unavailable' ? 30_000 : DAY_MS),
    queryFn: async (): Promise<IfscState> => {
      try {
        const response = await api.banking.ifsc({ params: { code } });
        if (response.status === 404) return { kind: 'not_found' };
        if (response.status === 200 && response.body.available && response.body.branch) {
          return { kind: 'found', branch: response.body.branch };
        }
      } catch {
        // Falls through: the check is a help, never a gate.
      }
      return { kind: 'unavailable' };
    },
  });
  if (!ready) return { kind: 'idle' };
  return query.data ?? { kind: 'checking' };
}

export interface BankCheck {
  readonly problems: Partial<Record<BankField, BankProblem>>;
  readonly ifsc: IfscState;
  /** Something typed is wrong, or the IFSC has no bank branch: do not save. */
  readonly blocked: boolean;
}

export function useBankCheck(values: BankValues): BankCheck {
  const problems = bankDraftProblems(values);
  const ifsc = useIfscLookup(values.bankIfsc);
  return {
    problems,
    ifsc,
    blocked: Object.keys(problems).length > 0 || ifsc.kind === 'not_found',
  };
}
