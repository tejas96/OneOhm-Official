'use client';

import type { Property } from '@oneohm/api-contracts';
import { Field, Input } from '@oneohm/design-system/web';
import { ArrowUpRight, LocateFixed } from 'lucide-react';
import { useTranslations } from 'next-intl';

const mapHref = (latitude: number, longitude: number) =>
  `https://www.google.com/maps?q=${latitude},${longitude}`;

/** The site's GPS point on its card, with a link to see it on a map (PRD 3.2). */
export function GpsLine({ property }: { readonly property: Property }) {
  const t = useTranslations('customers.property');
  const { latitude, longitude } = property;
  const known = latitude !== null && longitude !== null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-hairline pt-4">
      <span className="inline-flex items-center gap-1.5 type-label text-ink-faint">
        <LocateFixed aria-hidden className="size-3.5" />
        {t('gps')}
      </span>
      {known ? (
        <>
          <span className="font-mono type-body-sm text-ink tabular-nums">
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </span>
          <a
            href={mapHref(latitude, longitude)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 type-body-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {t('openMap')}
            <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        </>
      ) : (
        <span className="type-body-sm text-ink-faint">{t('gpsNone')}</span>
      )}
    </div>
  );
}

/** Latitude and longitude inputs for `PropertyFields`; blank means not known. */
export function GpsFields({
  initial,
  errors,
}: {
  readonly initial?: Property | undefined;
  readonly errors: (field: string) => string | undefined;
}) {
  const t = useTranslations('customers.property');
  const value = (number: number | null | undefined) =>
    number === null || number === undefined ? undefined : String(number);
  return (
    <>
      <Field label={t('latitude')} hint={t('gpsHint')} error={errors('latitude')}>
        <Input
          name="latitude"
          type="number"
          step="any"
          min={-90}
          max={90}
          inputMode="decimal"
          className="font-mono"
          defaultValue={value(initial?.latitude)}
        />
      </Field>
      <Field label={t('longitude')} error={errors('longitude')}>
        <Input
          name="longitude"
          type="number"
          step="any"
          min={-180}
          max={180}
          inputMode="decimal"
          className="font-mono"
          defaultValue={value(initial?.longitude)}
        />
      </Field>
    </>
  );
}

/** A coordinate typed in the form; blank (or not a number) is null. */
export function readCoordinate(data: FormData, name: 'latitude' | 'longitude'): number | null {
  const text = String(data.get(name) ?? '').trim();
  const number = Number.parseFloat(text);
  return text && Number.isFinite(number) ? number : null;
}
