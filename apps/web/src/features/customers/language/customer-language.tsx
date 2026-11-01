'use client';

import type { CustomerLanguageView } from '@oneohm/api-contracts';
import { SegmentedControl, useToast } from '@oneohm/design-system/web';
import { CUSTOMER_LANGUAGES, type CustomerLanguage, LANGUAGE_NAMES } from '@oneohm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';

const OPTIONS = CUSTOMER_LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }));
const languageKey = (customerId: string) => ['customers', customerId, 'language'];

/**
 * The customer's language (PRD 5.1): the customer app and its in-app updates use it.
 * Staff with customers.manage can change it, for a customer who asks on the phone.
 */
export function CustomerLanguageSetting({ customerId }: { readonly customerId: string }) {
  const t = useTranslations('customerLanguage');
  const toast = useToast();
  const client = useQueryClient();
  const canManage = useCan('customers.manage');
  const query = useQuery({
    queryKey: languageKey(customerId),
    queryFn: () =>
      expectStatus(api.customerLanguage.customerLanguage({ params: { id: customerId } }), 200),
  });
  const set = useMutation({
    mutationFn: (language: CustomerLanguage) =>
      expectStatus(
        api.customerLanguage.setCustomerLanguage({
          params: { id: customerId },
          body: { language },
        }),
        200,
      ),
    onSuccess: (saved: CustomerLanguageView) => {
      client.setQueryData(languageKey(customerId), saved);
      toast({ tone: 'success', title: t('saved'), description: LANGUAGE_NAMES[saved.language] });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const data = query.data;
  if (!data) return null;
  return (
    <div className="flex flex-col gap-3 border-hairline border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex max-w-xl flex-col gap-1">
        <span className="inline-flex items-center gap-2 type-label text-ink">
          <Languages aria-hidden className="size-4 text-ink-faint" />
          {t('label')}
        </span>
        <p className="type-body-sm text-ink-muted">{t('about')}</p>
      </div>
      {canManage ? (
        <SegmentedControl<CustomerLanguage>
          label={t('label')}
          size="sm"
          value={set.isPending && set.variables ? set.variables : data.language}
          onValueChange={(language) => {
            if (language !== data.language && !set.isPending) set.mutate(language);
          }}
          options={OPTIONS}
        />
      ) : (
        <span className="type-body text-ink">{LANGUAGE_NAMES[data.language]}</span>
      )}
    </div>
  );
}
