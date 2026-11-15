'use client';

import type { MarketingConnections, MarketingSettingsRecord } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { marketingKeys } from './use-marketing';

/** Saves the marketing defaults; errors (whole form and per field) come from `form`. */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = useTranslations('marketing');
  const form = useApiForm();
  const save = (body: MarketingSettingsRecord, message = t('toast.saved')) =>
    form.run(
      () => expectStatus(api.marketing.saveSettings({ body }), 200),
      (next: MarketingConnections) => {
        queryClient.setQueryData(marketingKeys.connections, next);
        void queryClient.invalidateQueries({ queryKey: marketingKeys.overview });
        toast({ title: message, tone: 'success' });
      },
    );
  return { form, save };
}
