'use client';

import { Switch, useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/**
 * A low-income household (PRD 3.5): the state top-up may apply to this home. Staff mark
 * it once the proof is filed under Income proof; the live price picks it up at once.
 */
export function LowIncomeSwitch({
  propertyId,
  lowIncome,
}: {
  readonly propertyId: string;
  readonly lowIncome: boolean;
}) {
  const t = useTranslations('stateSupport.household');
  const toast = useToast();
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (next: boolean) =>
      expectStatus(
        api.stateSupport.setLowIncome({ params: { id: propertyId }, body: { lowIncome: next } }),
        200,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['property', propertyId] }),
        client.invalidateQueries({ queryKey: ['quotation-preview'] }),
      ]);
      toast({ tone: 'success', title: t('saved') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  return (
    <Switch
      checked={save.isPending && save.variables !== undefined ? save.variables : lowIncome}
      onCheckedChange={(next) => save.mutate(next)}
      disabled={save.isPending}
      label={t('switch')}
      description={t('switchHint')}
    />
  );
}
