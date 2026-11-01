'use client';

import type { serviceTicketPatchSchema } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { z } from 'zod';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const SERVICE_KEY = ['service-requests'] as const;

export type TicketPatch = z.infer<typeof serviceTicketPatchSchema>;

export function useAssignees(enabled: boolean) {
  return useQuery({
    queryKey: [...SERVICE_KEY, 'assignees'],
    queryFn: () => expectStatus(api.serviceDesk.listAssignees(), 200),
    enabled,
  });
}

export function useServiceCategories(enabled = true) {
  return useQuery({
    queryKey: ['settings', 'service-categories'],
    queryFn: () => expectStatus(api.afterSales.listServiceCategories(), 200),
    enabled,
  });
}

/** Saves a change to one request and refreshes the desk. */
export function useUpdateTicket(id: string, onDone?: () => void) {
  const t = useTranslations('service');
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TicketPatch) =>
      expectStatus(api.serviceDesk.updateTicket({ params: { id }, body }), 200),
    onSuccess: async (ticket, body) => {
      await queryClient.invalidateQueries({ queryKey: SERVICE_KEY });
      onDone?.();
      const title = body.status
        ? t(`done.${body.status}`)
        : body.assigneeUserId !== undefined
          ? ticket.assignee
            ? t('sheet.assigned', { name: ticket.assignee.name })
            : t('sheet.unassignedDone')
          : t('sheet.categoryChanged');
      toast({ tone: 'success', title });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
