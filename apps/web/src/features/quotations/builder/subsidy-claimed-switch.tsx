'use client';

import { Switch, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/**
 * One subsidy per property (PRD 3.5): staff mark a site whose subsidy was claimed
 * before, or clear a mistake. The live price picks it up at once.
 */
export function SubsidyClaimedSwitch({
  propertyId,
  claimed,
}: {
  readonly propertyId: string;
  readonly claimed: boolean;
}) {
  const t = useTranslations('quotations.builder.customer');
  const toast = useToast();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (next: boolean) =>
      expectStatus(
        api.quotations.setSubsidyClaimed({ params: { id: propertyId }, body: { claimed: next } }),
        200,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['property', propertyId] }),
        client.invalidateQueries({ queryKey: ['quotation-preview'] }),
      ]);
      toast({ tone: 'success', title: t('claimedSaved') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('claimedFailed'), description: describeError(error) }),
  });
  return (
    <Switch
      checked={save.isPending && save.variables !== undefined ? save.variables : claimed}
      onCheckedChange={(next) => save.mutate(next)}
      disabled={save.isPending}
      label={t('claimedSwitch')}
      description={t('claimedSwitchHint')}
    />
  );
}
