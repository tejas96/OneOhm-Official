'use client';

import type { WorkLocationRecord } from '@oneohm/api-contracts';
import { Button, EmptyState, IconButton, Switch, useToast } from '@oneohm/design-system/web';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Pencil, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { SettingsSection } from '../settings-section';
import { PlaceDialog } from './place-dialog';
import { WORKFORCE_SETTINGS_KEY } from './use-workforce-settings';

/** The offices and yards check-ins are measured against; each change saves straight away. */
export function PlacesSection({
  locations,
}: {
  readonly locations: readonly WorkLocationRecord[];
}) {
  const t = useTranslations('settings.workforce.places');
  const toast = useToast();
  const queryClient = useQueryClient();
  // undefined: closed; null: a new place.
  const [editing, setEditing] = useState<WorkLocationRecord | null | undefined>(undefined);
  const [switching, setSwitching] = useState<string | null>(null);

  const setActive = async (place: WorkLocationRecord, active: boolean) => {
    setSwitching(place.id);
    try {
      const saved = await expectStatus(
        api.rewards.updateWorkLocation({ params: { id: place.id }, body: { active } }),
        200,
      );
      queryClient.setQueryData(WORKFORCE_SETTINGS_KEY, saved);
    } catch (error) {
      toast({ title: t('failed'), description: describeError(error), tone: 'error' });
    } finally {
      setSwitching(null);
    }
  };

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      {locations.length === 0 ? (
        <EmptyState icon={<MapPin />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-raised">
          {locations.map((place) => (
            <li key={place.id} className="flex items-center gap-2 py-1 pr-2 pl-4">
              <Switch
                className="min-w-0 flex-1"
                checked={place.active}
                disabled={switching === place.id}
                onCheckedChange={(active) => setActive(place, active)}
                label={place.name}
                description={t('summary', {
                  latitude: place.latitude.toFixed(4),
                  longitude: place.longitude.toFixed(4),
                  radius: place.radiusM,
                })}
              />
              <IconButton
                size="sm"
                label={t('edit', { name: place.name })}
                onClick={() => setEditing(place)}
              >
                <Pencil aria-hidden />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="type-body-sm text-ink-faint">{t('activeHint')}</p>
        <Button size="sm" leadingIcon={<Plus />} onClick={() => setEditing(null)}>
          {t('add')}
        </Button>
      </div>
      <PlaceDialog
        open={editing !== undefined}
        place={editing ?? null}
        onClose={() => setEditing(undefined)}
      />
    </SettingsSection>
  );
}
