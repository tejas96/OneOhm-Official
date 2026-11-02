import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { ArrowRight, Lock } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';

/** Stable keys for lines that may repeat (two tasks can share a title). */
const keyed = (lines: readonly string[]) => {
  const seen = new Map<string, number>();
  return lines.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);
    return { key: `${text}#${count}`, text };
  });
};

const partyName = (party: keyof typeof COMMON.parties) =>
  party === 'discom' ? COMMON.parties[party] : COMMON.parties[party].toLowerCase();

/**
 * What this task waits for (with who holds it and how late, or the outside party) and
 * what waits for it (spec 3.4). Nothing shows when it is free and holds nobody up.
 */
export function TaskBlockersCard({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  const done = task.status === 'completed';
  const details = task.blockers ?? [];
  const others = done
    ? []
    : task.blockedBy.filter((title) => !details.some((blocker) => blocker.title === title));
  const waitingFor = [
    ...details.map((blocker) =>
      blocker.waitingOn
        ? TASK.blockerOutside(blocker.title, partyName(blocker.waitingOn), blocker.daysLate)
        : TASK.blocker(blocker.title, blocker.assignee, blocker.daysLate),
    ),
    ...others,
  ];
  const blocking = done ? [] : (task.blocking ?? []);

  return (
    <>
      {waitingFor.length > 0 ? (
        <Card tone="sunken" style={styles.card}>
          <View style={styles.row}>
            <Lock size={16} color={theme.colors.textSecondary} />
            <Text variant="titleMd">{TASK.blockedTitle}</Text>
          </View>
          <Text variant="bodySm" tone="secondary">
            {TASK.blockedBody}
          </Text>
          {keyed(waitingFor).map((line) => (
            <Text key={line.key} variant="body">
              · {line.text}
            </Text>
          ))}
        </Card>
      ) : null}
      {blocking.length > 0 ? (
        <Card tone="sunken" style={styles.card}>
          <View style={styles.row}>
            <ArrowRight size={16} color={theme.status.atRisk.fg} />
            <Text variant="titleMd">{TASK.blockingTitle(blocking.length)}</Text>
          </View>
          <Text variant="bodySm" tone="secondary">
            {TASK.blockingBody}
          </Text>
          {keyed(blocking).map((line) => (
            <Text key={line.key} variant="body">
              · {line.text}
            </Text>
          ))}
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
