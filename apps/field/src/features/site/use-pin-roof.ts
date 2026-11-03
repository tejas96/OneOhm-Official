import type { TaskSite } from '@oneohm/api-contracts';
import type { GeoPoint } from '@oneohm/domain';
import { describeError } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform } from 'react-native';
import { useToast } from '@/components/toast';
import { SITE } from '@/copy/site';
import { mapsOn } from './maps-enabled';
import { type PinStart, pinOutcome, pinSavedMessage, shouldKeepPin } from './pin-flow';
import { resendPendingPin, usePendingPin } from './use-pending-pin';
import { readIfAllowed, useSiteAction } from './use-task-site';

/** The satellite map can show on this phone (see `mapsOn`); without it the old button shows. */
export const mapsEnabled = mapsOn(Platform.OS, Constants.expoConfig?.extra, Platform.Version);

/**
 * Pinning the roof from the site visit card: a precise reading, then the map sheet. The
 * pin is saved with the visit; one that fails for want of signal waits on the phone.
 */
export function usePinRoof(taskId: string, site: TaskSite) {
  const toast = useToast();
  const client = useQueryClient();
  const save = useSiteAction(taskId, 'save');
  const pending = usePendingPin(taskId);
  const [progress, setProgress] = useState<{ accuracyM: number | null } | null>(null);
  const [sheet, setSheet] = useState<{
    start: PinStart | null;
    canSetSite: boolean;
  } | null>(null);

  // Today's path: the check-in reading becomes the site location.
  const saveGps = () => {
    setSheet(null);
    save.mutate(
      { tracking: site.tracking },
      {
        onSuccess: () => toast(SITE.siteSaved),
        onError: (error) => toast(describeError(error)),
      },
    );
  };

  const begin = async () => {
    setProgress({ accuracyM: null });
    const { position } = await readIfAllowed(site.tracking, {
      precise: true,
      onProgress: (accuracyM) => setProgress({ accuracyM }),
    }).finally(() => setProgress(null));
    const start = position
      ? {
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyM: position.accuracyM,
        }
      : null;
    const outcome = pinOutcome(start, site.sitePoint, site.canSetSite);
    // The sheet's "Use my GPS reading" saves the check-in point when the visit has one,
    // else sends this fresh reading as a pin.
    if (outcome.kind === 'open') setSheet({ start: outcome.start, canSetSite: site.canSetSite });
    else if (outcome.kind === 'gps') saveGps();
    else toast(outcome.message);
  };

  const confirm = (pin: GeoPoint) => {
    setSheet(null);
    save.mutate(
      { tracking: site.tracking, pin },
      {
        onSuccess: ({ site: saved }) => toast(pinSavedMessage(saved.siteFlagged)),
        onError: (error) => {
          // The queue keeps a pin that failed for want of signal, to send again.
          toast(shouldKeepPin(error) ? SITE.pinWaiting : describeError(error));
        },
      },
    );
  };

  return {
    sheet,
    begin,
    confirm,
    saveGps,
    close: () => setSheet(null),
    /** Sends a waiting pin first, e.g. before checking out (the server needs the visit). */
    flush: async () => {
      const refused = await resendPendingPin(taskId, client);
      if (refused) toast(refused);
    },
    waiting: pending.pending !== null,
    isPending: save.isPending,
    /** What the button says while the precise reading runs, else null. */
    label: progress ? SITE.finding(progress.accuracyM) : null,
  };
}
