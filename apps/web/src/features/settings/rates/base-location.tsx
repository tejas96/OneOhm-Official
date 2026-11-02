'use client';

import type { Company } from '@oneohm/api-contracts';
import { Field } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PinMap } from '@/features/maps/pin-map';
import { KOLHAPUR, pinMapValue } from '@/features/maps/pin-map-value';
import { api, expectStatus } from '@/lib/api/api-client';
import { useApiForm } from '@/lib/forms/use-api-form';
import { SETTINGS_KEYS } from '../use-settings';
import { DecimalInput } from './decimal-input';

interface Point {
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/**
 * The company's base (PRD 3.9 B), kept on the company profile: site distances for
 * quotations are measured from it. Saved with the travel rates.
 */
export function useBaseSaver(company: Company | undefined) {
  const queryClient = useQueryClient();
  const form = useApiForm();
  const [point, setPoint] = useState<Point>({ latitude: null, longitude: null });
  const known = {
    latitude: company?.baseLatitude ?? null,
    longitude: company?.baseLongitude ?? null,
  };
  useEffect(() => {
    setPoint({ latitude: known.latitude, longitude: known.longitude });
  }, [known.latitude, known.longitude]);

  const save = async (): Promise<boolean> => {
    if (point.latitude === known.latitude && point.longitude === known.longitude) return true;
    const body = { baseLatitude: point.latitude, baseLongitude: point.longitude };
    const saved = await form.run(
      () => expectStatus(api.catalog.updateCompany({ body }), 200),
      (result) => {
        queryClient.setQueryData(SETTINGS_KEYS.company, result);
      },
    );
    return saved !== undefined;
  };
  return {
    point,
    setPoint,
    save,
    error: form.error,
    pending: form.pending,
    errors: form.fieldErrors,
  };
}

export function BaseLocation({ saver }: { readonly saver: ReturnType<typeof useBaseSaver> }) {
  const t = useTranslations('costing.labour');
  const { point, setPoint, errors } = saver;
  return (
    <div className="flex flex-col gap-2">
      <PinMap
        value={pinMapValue.fromNumbers(point.latitude, point.longitude)}
        fallbackCenter={KOLHAPUR}
        onChange={(pinned) => {
          const text = pinMapValue.format(pinned);
          setPoint({ latitude: Number(text.latitude), longitude: Number(text.longitude) });
        }}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field label={t('baseLatitude')} error={errors.baseLatitude}>
          <DecimalInput
            decimals={6}
            value={point.latitude}
            onValueChange={(latitude) => setPoint({ ...point, latitude })}
          />
        </Field>
        <Field label={t('baseLongitude')} error={errors.baseLongitude}>
          <DecimalInput
            decimals={6}
            value={point.longitude}
            onValueChange={(longitude) => setPoint({ ...point, longitude })}
          />
        </Field>
      </div>
      <p className="type-body-sm text-ink-faint">{t('baseHint')}</p>
    </div>
  );
}
