import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';

/** The person's alerts; refreshed every minute while the app is open. */
export function useInbox() {
  return useQuery({
    queryKey: keys.inbox,
    queryFn: () => unwrap(api.notifications.inbox()),
    refetchInterval: 60_000,
  });
}

/** Marks the given alerts read, or all of them when no ids are given. */
export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) =>
      unwrap(api.notifications.markRead({ body: ids ? { ids } : {} })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.inbox }),
  });
}
