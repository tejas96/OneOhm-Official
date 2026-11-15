import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  Button,
  describeError,
  LoadingState,
  PressableScale,
  Sheet,
  StatusPill,
  Text,
  type Tone,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { InitialsBadge } from '@/components/initials';
import { COMMON } from '@/copy/common';
import { COVER, REQUEST_LEAVE } from '@/copy/workforce';
import { useChangeBackup } from './use-cover';

/** What the named backup said, and, when they declined, a way to ask someone else. */
export function BackupStatus({ request }: { readonly request: LeaveRequestRecord }) {
  const [asking, setAsking] = useState(false);
  const { backup, coverAnswer } = request;
  if (!backup || !coverAnswer) return null;
  const name = backup.fullName;
  const text = { asked: COVER.waiting, accepted: COVER.accepted, declined: COVER.declined }[
    coverAnswer
  ](name);
  const tone: Tone = { asked: 'review', accepted: 'done', declined: 'overdue' }[
    coverAnswer
  ] as Tone;
  return (
    <View style={styles.box}>
      <StatusPill size="sm" tone={tone} label={text} />
      {coverAnswer !== 'asked' && request.coverNote ? (
        <Text variant="bodySm" tone="secondary">
          “{request.coverNote}”
        </Text>
      ) : null}
      {request.status === 'pending' && coverAnswer === 'declined' ? (
        <>
          <Button
            label={COVER.askElse}
            size="sm"
            variant="quiet"
            onPress={() => setAsking(true)}
            style={styles.ask}
          />
          {asking ? <AskSheet request={request} onClose={() => setAsking(false)} /> : null}
        </>
      ) : null}
    </View>
  );
}

function AskSheet({
  request,
  onClose,
}: {
  readonly request: LeaveRequestRecord;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const change = useChangeBackup(request.id);
  const window = {
    leaveType: request.leaveType,
    fromDate: request.fromDate,
    toDate: request.toDate,
    halfDay: request.halfDay,
  };
  const impact = useQuery({
    queryKey: ['leave-impact', window],
    queryFn: () => unwrap(api.workforce.leaveImpact({ body: window })),
  });
  const people = (impact.data?.backups ?? []).filter((person) => person.id !== request.backup?.id);
  return (
    <Sheet
      open
      onClose={onClose}
      title={COVER.askElseTitle}
      description={COVER.askElseBody}
      closeLabel={COMMON.close}
    >
      {impact.isPending ? <LoadingState label={REQUEST_LEAVE.checking} /> : null}
      {impact.data && people.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {COVER.none}
        </Text>
      ) : null}
      {people.map((person) => (
        <PressableScale
          key={person.id}
          accessibilityRole="button"
          accessibilityLabel={person.fullName}
          onPress={() => {
            if (!change.isPending) change.mutate(person.id, { onSuccess: onClose });
          }}
          style={[styles.person, { borderColor: theme.colors.borderSubtle }]}
        >
          <InitialsBadge name={person.fullName} />
          <View style={styles.grow}>
            <Text variant="body">{person.fullName}</Text>
            <Text variant="label" tone="tertiary">
              {REQUEST_LEAVE.openTasks(person.openTasks)}
            </Text>
          </View>
        </PressableScale>
      ))}
      {change.error || impact.error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {describeError(change.error ?? impact.error)}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  box: { gap: 6 },
  ask: { alignSelf: 'flex-start' },
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
