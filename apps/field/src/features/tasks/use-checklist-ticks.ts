import type { ProjectTask } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, keys } from '@/api/api';

/**
 * The checklist ticks on this phone. Each tick is saved at once when the person may work
 * the task, so it counts as an update (spec 3.5). If saving fails (no signal), the tick
 * stays here and is still sent with "Complete", so nothing is lost.
 */
export function useChecklistTicks(task: ProjectTask, canWork: boolean) {
  const client = useQueryClient();
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(task.checklist.filter((item) => item.done).map((item) => item.key)),
  );
  const save = useMutation({
    mutationFn: (input: { key: string; done: boolean }) =>
      unwrap(api.tasks.tickChecklist({ params: { id: task.id }, body: input })),
    onSuccess: (updated: ProjectTask) => {
      client.setQueryData<ProjectTask>(keys.task(updated.id), updated);
      void client.invalidateQueries({ queryKey: keys.tasks });
    },
  });
  const toggle = (key: string) => {
    const done = !ticked.has(key);
    const next = new Set(ticked);
    if (done) next.add(key);
    else next.delete(key);
    setTicked(next);
    // Saved once, from the tap itself (never from inside a state update).
    if (canWork) save.mutate({ key, done });
  };
  return { ticked, toggle };
}
