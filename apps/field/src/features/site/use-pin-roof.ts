import type { TaskSite } from '@oneohm/api-contracts';
import type { GeoPoint } from '@oneohm/domain';
import { describeError } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform } from 'react-native';
import { useToast } from '@/components/toast';
import { SITE } from '@/copy/site';
import { type PinStart, pinOutcome, pinSavedMessage, shouldKeepPin } from './pin-flow';
import { resendPendingPin, usePendingPin } from './use-pending-pin';
import { readIfAllowed, useSiteAction } from './use-task-site';

/** A Google key was set at build time (Task 4); without one the old button shows. */
export const mapsEnabled =
  Platform.OS !== 'web' && Constants.expoConfig?.extra?.mapsEnabled === true;

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
  const [sheet, setSheet] = useState<{ start: PinStart | null } | null>(null);

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
    const outcome = pinOutcome(start, site.sitePoint);
    if (outcome.open) setSheet({ start: outcome.start });
    else toast(outcome.message);
  };

  const confirm = (pin: GeoPoint) => {
    setSheet(null);
    save.mutate(
      { tracking: site.tracking, pin },
      {
        onSuccess: ({ site: saved }) => toast(pinSavedMessage(saved.siteFlagged)),
        onError: (error) => {
          if (!shouldKeepPin(error)) return toast(describeError(error));
          pending.keep(pin);
          toast(SITE.pinWaiting);
        },
      },
    );
  };

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

  return {
    sheet,
    begin,
    confirm,
    saveGps,
    close: () => setSheet(null),
    /** Sends a waiting pin first, e.g. before checking out (the server needs the visit). */
    flush: () => resendPendingPin(taskId, client),
    waiting: pending.pending !== null,
    isPending: save.isPending,
    /** What the button says while the precise reading runs, else null. */
    label: progress ? SITE.finding(progress.accuracyM) : null,
  };
}
