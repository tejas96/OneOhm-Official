'use client';

import type { RateCardValues } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { SETTINGS_KEYS } from '../use-settings';

/**
 * Saves the whole costing card from any part of Settings → Rates. Each sheet or section
 * edits its own part of the card and saves; the card stays one document, so quotations
 * can snapshot exactly what they were priced with.
 */
export function useCardSaver() {
  const settingsT = useTranslations('settings');
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useApiForm();

  const save = async (next: RateCardValues): Promise<boolean> => {
    const saved = await form.run(
      () => expectStatus(api.catalog.updateRateCard({ body: next }), 200),
      (result) => {
        queryClient.setQueryData(SETTINGS_KEYS.rateCard, result);
        toast({ title: settingsT('saved'), reference: result.name, tone: 'success' });
      },
    );
    return saved !== undefined;
  };

  return { save, form };
}

/** A short name for a new rate line from its label: lower case, underscores, unique. */
export function keyFor(label: string, taken: readonly string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'r_$1')
      .slice(0, 32) || 'rate';
  const safe = /^(panel|inverter|battery|structure|transport|extra_\d+)$/.test(base)
    ? `${base}_rate`
    : base;
  let key = safe.length < 2 ? `${safe}_rate` : safe;
  for (let n = 2; taken.includes(key); n += 1) key = `${safe}_${n}`;
  return key;
}
