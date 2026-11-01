import type { ProjectTask } from '@oneohm/api-contracts';
import { asksForDiscom } from '@oneohm/domain';
import { Button, describeError, Field, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { useToast } from '@/components/toast';
import { DISCOM } from '@/copy/capture';
import { useCan, useCurrentUser } from '@/session/session-provider';
import { DiscomPicker } from './discom-picker';
import { offeredDiscoms, useDiscoms } from './use-discoms';

const connectionKey = (taskId: string) => ['site', 'connection', 'task', taskId] as const;

/**
 * On the task that verifies the electricity bill: the DISCOM, to confirm or correct
 * (PRD 4.2). It is saved straight away on the site and the project.
 */
export function TaskDiscomField({ task }: { readonly task: ProjectTask }) {
  return asksForDiscom(task) ? <DiscomChoice task={task} /> : null;
}

function DiscomChoice({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  const client = useQueryClient();
  const toast = useToast();
  const user = useCurrentUser();
  const manager = useCan('discom.manage', 'projects.manage');
  const editable = task.status !== 'completed' && (task.assignee?.id === user.id || manager);
  const connection = useQuery({
    queryKey: connectionKey(task.id),
    queryFn: () => unwrap(api.siteConnection.taskConnection({ params: { id: task.id } })),
  });
  const discoms = useDiscoms();
  const save = useMutation({
    mutationFn: (discomId: string) =>
      unwrap(
        api.siteConnection.updateTaskConnection({ params: { id: task.id }, body: { discomId } }),
      ),
    onSuccess: (next) => {
      client.setQueryData(connectionKey(task.id), next);
      toast(DISCOM.saved);
    },
  });
  if (connection.isError || discoms.isError) {
    return (
      <Text variant="bodySm" tone="tertiary">
        {DISCOM.loadError}
      </Text>
    );
  }
  if (!connection.data || !discoms.data) return null;
  const { discomId: current, confirmed } = connection.data;
  const offered = offeredDiscoms(discoms.data, current);
  const picked = offered.find((discom) => discom.id === current);
  if (!editable) {
    return (
      <Field label={DISCOM.label}>
        <Text variant="body">{picked ? `${picked.code} · ${picked.name}` : DISCOM.notSet}</Text>
      </Field>
    );
  }
  return (
    <View style={styles.block}>
      <DiscomPicker
        discoms={offered}
        value={save.isPending ? (save.variables ?? current) : current}
        onChange={(discomId) => {
          if (discomId !== current || !confirmed) save.mutate(discomId);
        }}
        error={save.error ? describeError(save.error) : undefined}
      />
      {confirmed ? (
        <View style={styles.row}>
          <CircleCheck size={14} color={theme.status.onTrack.fg} />
          <Text variant="label" color={theme.status.onTrack.fg}>
            {DISCOM.confirmed}
          </Text>
        </View>
      ) : picked ? (
        <Button
          label={DISCOM.confirm(picked.code)}
          size="sm"
          variant="secondary"
          pending={save.isPending}
          onPress={() => save.mutate(picked.id)}
          style={styles.confirm}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirm: { alignSelf: 'flex-start' },
});
