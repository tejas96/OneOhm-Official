'use client';

import type { Role } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import type { Capability } from '@oneohm/domain';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { ROLES_KEY } from '@/features/team/use-team';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { asPredicate, withCapability } from './grid-model';

export interface CapabilityChange {
  readonly role: Role;
  readonly capability: Capability;
  /** True to allow the permission, false to take it away. */
  readonly grant: boolean;
}

const TOGGLE_KEY = ['roles', 'toggle-capability'] as const;

export const cellKey = (roleId: string, capability: Capability) => `${roleId}:${capability}`;

/**
 * The cells whose save is still waiting or running. They stay disabled until it settles,
 * so a double click cannot queue two opposite changes for one cell.
 */
export function usePendingCells(): ReadonlySet<string> {
  const pending = useMutationState({
    filters: { mutationKey: TOGGLE_KEY, status: 'pending' },
    select: (mutation) => {
      const change = mutation.state.variables as CapabilityChange | undefined;
      return change ? cellKey(change.role.id, change.capability) : '';
    },
  });
  return new Set(pending.filter(Boolean));
}

/**
 * Flips one role × permission cell. The grid changes at once; saves run one at a
 * time, each sending the role's latest full list, and a failed save flips only its
 * own cell back. Once the last save settles the roles are fetched again.
 */
export function useToggleCapability() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const settingsT = useTranslations('settings');
  const t = useTranslations('settings.roles.grid');

  const setCell = (change: CapabilityChange, granted: boolean) =>
    queryClient.setQueryData<Role[]>(ROLES_KEY, (roles) =>
      withCapability(roles, change.role.id, change.capability, granted),
    );
  const sentence = (change: CapabilityChange) => ({
    role: change.role.name,
    capability: asPredicate(settingsT(`capabilities.${change.capability}`)),
  });

  return useMutation({
    mutationKey: TOGGLE_KEY,
    scope: { id: TOGGLE_KEY.join('.') },
    onMutate: async (change: CapabilityChange) => {
      await queryClient.cancelQueries({ queryKey: ROLES_KEY });
      setCell(change, change.grant);
    },
    mutationFn: (change: CapabilityChange) => {
      const latest = queryClient
        .getQueryData<Role[]>(ROLES_KEY)
        ?.find((role) => role.id === change.role.id);
      if (!latest) throw new Error(t('stale'));
      return expectStatus(
        api.people.updateRole({
          params: { id: latest.id },
          body: { capabilities: [...latest.capabilities] },
        }),
        200,
      );
    },
    onSuccess: (_saved, change) =>
      toast({
        title: change.grant ? t('granted', sentence(change)) : t('revoked', sentence(change)),
        tone: 'success',
      }),
    onError: (error, change) => {
      setCell(change, !change.grant);
      toast({
        title: t('failed', { role: change.role.name }),
        description: describeError(error),
        tone: 'error',
      });
    },
    onSettled: async () => {
      if (queryClient.isMutating({ mutationKey: TOGGLE_KEY }) > 1) return;
      await queryClient.invalidateQueries({ queryKey: ROLES_KEY });
    },
  });
}
