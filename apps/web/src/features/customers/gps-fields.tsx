'use client';

import type { Property } from '@oneohm/api-contracts';
import { Field, Input } from '@oneohm/design-system/web';
import { ArrowUpRight, LocateFixed } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PinMap } from '@/features/maps/pin-map';
import { KOLHAPUR, pinMapValue } from '@/features/maps/pin-map-value';
import { useMapsKey } from '@/features/maps/use-maps-config';
import { useCompany } from '@/features/settings/use-settings';
import { LocationFlag } from './location-flag';

const mapHref = (latitude: number, longitude: number) =>
  `https://www.google.com/maps?q=${latitude},${longitude}`;

/** The site's GPS point on its card, how it was set, and a link to see it on a map (PRD 3.2). */
export function GpsLine({ property }: { readonly property: Property }) {
  const t = useTranslations('customers.property');
  const { latitude, longitude, locationSource } = property;
  const known = latitude !== null && longitude !== null;
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5 type-label text-ink-faint">
          <LocateFixed aria-hidden className="size-3.5" />
          {t('gps')}
        </span>
        {known ? (
          <>
            <span className="font-mono type-body-sm text-ink tabular-nums">
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </span>
            {locationSource && (
              <span className="type-body-sm text-ink-muted">
                {t(`locationSource.${locationSource}`)}
              </span>
            )}
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
      {property.locationFlagged && <LocationFlag property={property} />}
    </div>
  );
}

type Source = '' | 'map_pin' | 'typed';

const text = (number: number | null | undefined) =>
  number === null || number === undefined ? '' : String(number);

/**
 * Latitude and longitude for `PropertyFields`; blank means not known. With a maps key the
 * site is pinned on a satellite map and the numbers travel in hidden inputs ("Type
 * coordinates" shows them). Without one, the two number inputs show as before.
 * `locationSource` tells the API how the point was set.
 */
export function GpsFields({
  initial,
  errors,
}: {
  readonly initial?: Property | undefined;
  readonly errors: (field: string) => string | undefined;
}) {
  const t = useTranslations('customers.property');
  const mapsT = useTranslations('common.maps');
  const mapsKey = useMapsKey();
  const company = useCompany();
  const [latitude, setLatitude] = useState(text(initial?.latitude));
  const [longitude, setLongitude] = useState(text(initial?.longitude));
  const [source, setSource] = useState<Source>('');
  const [typing, setTyping] = useState(false);
  const withMap = mapsKey !== null && !company.isPending;
  const showInputs = !withMap || typing || Boolean(errors('latitude') || errors('longitude'));
  const fallbackCenter =
    pinMapValue.fromNumbers(company.data?.baseLatitude, company.data?.baseLongitude) ?? KOLHAPUR;

  const typed = (name: 'latitude' | 'longitude', next: string) => {
    (name === 'latitude' ? setLatitude : setLongitude)(next);
    setSource('typed');
    // Someone typing keeps the inputs, even if the map loads meanwhile.
    setTyping(true);
  };

  return (
    <>
      <input type="hidden" name="locationSource" value={source} />
      {withMap && (
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className="type-label text-ink-muted">{t('pinLabel')}</span>
          <PinMap
            value={pinMapValue.parse(latitude, longitude)}
            fallbackCenter={fallbackCenter}
            onChange={(point) => {
              const next = pinMapValue.format(point);
              setLatitude(next.latitude);
              setLongitude(next.longitude);
              setSource('map_pin');
            }}
          />
          {!showInputs && (
            <button
              type="button"
              onClick={() => setTyping(true)}
              className="self-start py-2 type-body-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              {mapsT('typeCoordinates')}
            </button>
          )}
        </div>
      )}
      {showInputs ? (
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
              value={latitude}
              onChange={(event) => typed('latitude', event.target.value)}
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
              value={longitude}
              onChange={(event) => typed('longitude', event.target.value)}
            />
          </Field>
        </>
      ) : (
        <>
          <input type="hidden" name="latitude" value={latitude} />
          <input type="hidden" name="longitude" value={longitude} />
        </>
      )}
    </>
  );
}

/** A coordinate typed in the form; blank (or not a number) is null. */
export function readCoordinate(data: FormData, name: 'latitude' | 'longitude'): number | null {
  const text = String(data.get(name) ?? '').trim();
  const number = Number.parseFloat(text);
  return text && Number.isFinite(number) ? number : null;
}

/** How the form says the point was set; nothing when it was not touched. */
export function readLocationSource(data: FormData): 'map_pin' | 'typed' | undefined {
  const source = String(data.get('locationSource') ?? '');
  return source === 'map_pin' || source === 'typed' ? source : undefined;
}
