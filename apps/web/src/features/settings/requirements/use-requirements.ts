'use client';

import type { DocumentRequirementInput } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const REQUIREMENTS_KEY = ['document-requirements'] as const;

export function useRequirements() {
  return useQuery({
    queryKey: REQUIREMENTS_KEY,
    queryFn: () => expectStatus(api.documentRequirements.listDocumentRequirements(), 200),
  });
}

type Change =
  | { readonly kind: 'add'; readonly body: DocumentRequirementInput }
  | {
      readonly kind: 'update';
      readonly key: string;
      readonly body: Partial<DocumentRequirementInput> & {
        active?: boolean;
        move?: 'up' | 'down';
      };
    };

/** Every change answers with the whole list, which replaces the cached one. */
export function useChangeRequirements(onDone?: () => void) {
  const t = useTranslations('settings.requirements');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (change: Change) =>
      change.kind === 'add'
        ? expectStatus(
            api.documentRequirements.createDocumentRequirement({ body: change.body }),
            201,
          )
        : expectStatus(
            api.documentRequirements.updateDocumentRequirement({
              params: { key: change.key },
              body: change.body,
            }),
            200,
          ),
    onSuccess: async (list) => {
      client.setQueryData(REQUIREMENTS_KEY, list);
      await client.invalidateQueries({ queryKey: ['projects'] });
      onDone?.();
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
