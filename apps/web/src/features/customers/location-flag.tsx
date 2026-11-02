'use client';

import type { Property } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';

type Action = 'confirm' | 'restore';

/**
 * A field pin set far from where the worker stood (or with no reading to compare): saved, but
 * the office keeps it or puts back the earlier point. Both are audited by the API.
 */
export function LocationFlag({ property }: { readonly property: Property }) {
  const t = useTranslations('customers.property.locationFlag');
  const toast = useToast();
  const queryClient = useQueryClient();
  const canAct = useCan('customers.manage', 'surveys.perform', 'discom.manage');
  const act = useMutation({
    mutationFn: (action: Action) => {
      const request = { params: { id: property.id }, body: {} };
      return action === 'confirm'
        ? expectStatus(api.crm.confirmSiteLocation(request), 200)
        : expectStatus(api.crm.restoreSiteLocation(request), 200);
    },
    onSuccess: async (_saved, action) => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast({ tone: 'success', title: action === 'confirm' ? t('kept') : t('restored') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const distance = property.locationFlagDistanceM;

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg bg-waiting-tint px-3.5 py-3 sm:flex-row sm:items-center"
    >
      <p className="flex flex-1 items-start gap-2 type-body-sm text-waiting">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        {distance === null || distance === undefined ? t('noReading') : t('moved', { distance })}
      </p>
      {canAct && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            pending={act.isPending && act.variables === 'confirm'}
            disabled={act.isPending}
            onClick={() => act.mutate('confirm')}
          >
            {t('keep')}
          </Button>
          {property.hasPreviousLocation && (
            <Button
              size="sm"
              variant="quiet"
              pending={act.isPending && act.variables === 'restore'}
              disabled={act.isPending}
              onClick={() => act.mutate('restore')}
            >
              {t('restore')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
