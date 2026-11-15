import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { COVER } from '@/copy/workforce';

/** Leave the person is asked to cover, or covers. */
export function useCovering() {
  return useQuery({
    queryKey: keys.covering,
    queryFn: () => unwrap(api.workforce.coveringLeave()),
  });
}

function useRefresh() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: keys.covering }),
      client.invalidateQueries({ queryKey: keys.workday }),
    ]);
  };
}

/** Accept or decline covering. A refusal shows in the sheet, so there is no error toast. */
export function useAnswerCover(id: string) {
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (answer: { readonly accept: boolean; readonly note: string }) =>
      unwrap(
        api.workforce.answerCover({
          params: { id },
          body: { accept: answer.accept, note: answer.note.trim() || null },
        }),
      ),
    onSuccess: async () => {
      await refresh();
      toast(COVER.answered);
    },
  });
}

/** Ask someone else to cover a pending request. */
export function useChangeBackup(id: string) {
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (backupUserId: string | null) =>
      unwrap(api.workforce.changeBackup({ params: { id }, body: { backupUserId } })),
    onSuccess: async () => {
      await refresh();
      toast(COVER.asked);
    },
  });
}
