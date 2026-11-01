import type { LeaveImpact } from '@oneohm/api-contracts';
import { Card, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { Check, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { InitialsBadge } from '@/components/initials';
import { REQUEST_LEAVE } from '@/copy/workforce';
import { shortDate } from '@/lib/dates';

/** Days counted, balance after, the work due meanwhile and who could cover it. */
export function ImpactCard({
  impact,
  backupId,
  onBackup,
}: {
  readonly impact: LeaveImpact;
  readonly backupId: string | null;
  readonly onBackup: (id: string | null) => void;
}) {
  const theme = useTheme();
  const over = impact.balanceAfterHalfDays < 0;
  return (
    <Card style={styles.card}>
      <Text variant="titleMd">{REQUEST_LEAVE.impactTitle}</Text>
      <Text variant="body">{REQUEST_LEAVE.counted(impact.halfDays)}</Text>
      <Text variant="bodySm" color={over ? theme.status.overdue.fg : theme.colors.textSecondary}>
        {REQUEST_LEAVE.after(impact.balanceAfterHalfDays)}
      </Text>
      {impact.overlapsExisting ? (
        <View style={styles.warn}>
          <TriangleAlert size={16} color={theme.status.atRisk.fg} />
          <Text variant="bodySm" color={theme.status.atRisk.fg}>
            {REQUEST_LEAVE.overlap}
          </Text>
        </View>
      ) : null}
      <Text variant="overline" tone="tertiary">
        {REQUEST_LEAVE.workTitle}
      </Text>
      {impact.tasks.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {REQUEST_LEAVE.noWork}
        </Text>
      ) : (
        impact.tasks.map((task) => (
          <View key={task.id} style={styles.task}>
            <Text variant="body">{task.title}</Text>
            <Text variant="label" tone="tertiary">
              {REQUEST_LEAVE.dueOn(task.projectCode, shortDate(task.dueDate))}
            </Text>
          </View>
        ))
      )}
      {impact.tasks.length > 0 ? (
        <>
          <Text variant="overline" tone="tertiary">
            {REQUEST_LEAVE.backupTitle}
          </Text>
          <Text variant="label" tone="tertiary">
            {REQUEST_LEAVE.backupHint}
          </Text>
          {impact.backups.length === 0 ? (
            <Text variant="bodySm" tone="secondary">
              {REQUEST_LEAVE.noBackup}
            </Text>
          ) : (
            impact.backups.map((person) => {
              const chosen = person.id === backupId;
              return (
                <PressableScale
                  key={person.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  accessibilityLabel={person.fullName}
                  onPress={() => onBackup(chosen ? null : person.id)}
                  style={[
                    styles.person,
                    { borderColor: chosen ? theme.colors.accent : theme.colors.borderSubtle },
                  ]}
                >
                  <InitialsBadge name={person.fullName} />
                  <View style={styles.grow}>
                    <Text variant="body">{person.fullName}</Text>
                    <Text variant="label" tone="tertiary">
                      {REQUEST_LEAVE.openTasks(person.openTasks)}
                    </Text>
                  </View>
                  {chosen ? <Check size={18} color={theme.colors.accent} /> : null}
                </PressableScale>
              );
            })
          )}
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  task: { gap: 2 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  grow: { flex: 1 },
});
