import { Button, Card, Text, useTheme } from '@oneohm/mobile-ui';
import { Package } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CREW } from '@/copy/crew';
import { useCrewMaterial, useIsCrew } from './use-crew';
import { UseSheet } from './use-sheet';

/**
 * On a task, for a crew holding material on that project: a reminder and a way to record
 * what went into the system as the task is finished (usage at task completion).
 */
export function CrewMaterialPrompt({
  projectId,
  taskId,
}: {
  readonly projectId: string;
  readonly taskId: string;
}) {
  const crew = useIsCrew();
  return crew ? <Prompt projectId={projectId} taskId={taskId} /> : null;
}

function Prompt({ projectId, taskId }: { readonly projectId: string; readonly taskId: string }) {
  const theme = useTheme();
  const query = useCrewMaterial();
  const [open, setOpen] = useState(false);
  const project = query.data?.projects.find((row) => row.project.id === projectId);
  const count = project?.holdings.filter((holding) => holding.balance > 0.0005).length ?? 0;
  if (!project || count === 0) return null;
  return (
    <Card tone="sunken" style={styles.card}>
      <View style={styles.row}>
        <Package size={16} color={theme.colors.textSecondary} />
        <Text variant="titleMd">{CREW.prompt.title}</Text>
      </View>
      <Text variant="bodySm" tone="secondary">
        {CREW.prompt.body(count)}
      </Text>
      <Button
        label={CREW.prompt.action}
        variant="secondary"
        size="sm"
        onPress={() => setOpen(true)}
      />
      <UseSheet project={open ? project : null} taskId={taskId} onClose={() => setOpen(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
