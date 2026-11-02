import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { REQUEST_LEAVE } from '@/copy/workforce';

export interface LeaveWindow {
  readonly leaveType: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly halfDay: boolean;
}

export interface LeaveExtras {
  readonly reason: string;
  readonly emergency: boolean;
  readonly backupUserId: string | null;
  readonly handover: string;
}

/** Sends the request (errors show on the screen), refreshes the person's day and goes back with a short note. */
export function useSendLeave(window: LeaveWindow | null, extras: LeaveExtras) {
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!window) throw new Error(REQUEST_LEAVE.pickDays);
      return unwrap(
        api.workforce.applyLeave({
          body: {
            ...window,
            reason: extras.reason.trim() || null,
            emergency: extras.emergency,
            backupUserId: extras.backupUserId,
            handoverNote: extras.handover.trim() || null,
          },
        }),
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.workday });
      toast(REQUEST_LEAVE.sent);
      router.back();
    },
    // A failure shows on the screen, next to what to fix (not as a passing toast).
  });
}
