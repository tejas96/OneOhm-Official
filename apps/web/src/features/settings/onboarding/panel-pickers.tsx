'use client';

import type { OnboardingSettingsRecord } from '@oneohm/api-contracts';
import { Button, Field, SearchSelect } from '@oneohm/design-system/web';
import { formatWp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { productOptions, useSearchWords } from '@/components/product-search';
import { api, expectStatus } from '@/lib/api/api-client';

type Panels = OnboardingSettingsRecord['panelProductIds'];
const SITES = [
  { key: 'individual', label: 'home' },
  { key: 'commercial', label: 'business' },
] as const;

/** One optional panel per site type, chosen from the active panels in the catalog. */
export function PanelPickers({
  value,
  errors,
  onChange,
}: {
  readonly value: Panels;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (panels: Panels) => void;
}) {
  const t = useTranslations('settings.onboarding');
  const words = useSearchWords();
  const panels = useQuery({
    queryKey: ['settings', 'onboarding', 'panels'],
    queryFn: () => expectStatus(api.catalog.listProducts({ query: { category: 'panel' } }), 200),
  });
  const options = productOptions(panels.data ?? [], (p) =>
    p.wattageWp ? formatWp(p.wattageWp) : undefined,
  );
  const pick = (key: keyof Panels, id: string | undefined) => {
    const { [key]: _removed, ...rest } = value;
    onChange(id ? { ...rest, [key]: id } : rest);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {SITES.map(({ key, label }) => (
        <Field key={key} label={t(label)} error={errors[`panel_${key}`]}>
          <SearchSelect
            {...words}
            value={value[key]}
            onValueChange={(id) => pick(key, id)}
            options={options}
          />
          {value[key] && (
            <Button variant="quiet" onClick={() => pick(key, undefined)}>
              {t('useSuggested')}
            </Button>
          )}
        </Field>
      ))}
    </div>
  );
}
