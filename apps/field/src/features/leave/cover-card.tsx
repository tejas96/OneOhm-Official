import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  StatusPill,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { COVER } from '@/copy/workforce';
import { dateRange } from './date-range';
import { useAnswerCover } from './use-cover';

/** Leave the person is asked to cover: the dates, their note, and Accept or Decline. */
export function CoverCard({ items }: { readonly items: readonly LeaveRequestRecord[] }) {
  return (
    <View style={styles.list}>
      <Text variant="overline" tone="tertiary">
        {COVER.title}
      </Text>
      {items.map((item) => (
        <CoverItem key={item.id} request={item} />
      ))}
    </View>
  );
}

function CoverItem({ request }: { readonly request: LeaveRequestRecord }) {
  const [accept, setAccept] = useState<boolean | null>(null);
  const open = request.status === 'pending' && request.coverAnswer === 'asked';
  return (
    <Card style={styles.card}>
      <Text variant="titleMd">{COVER.for(request.user.fullName)}</Text>
      <Text variant="body" tone="secondary">
        {dateRange(request)}
      </Text>
      {request.handoverNote ? (
        <Text variant="bodySm" tone="secondary">
          {COVER.handover}: {request.handoverNote}
        </Text>
      ) : null}
      {open ? (
        <View style={styles.buttons}>
          <Button label={COVER.accept} size="sm" onPress={() => setAccept(true)} />
          <Button
            label={COVER.decline}
            size="sm"
            variant="quiet"
            onPress={() => setAccept(false)}
          />
        </View>
      ) : (
        <Answered request={request} />
      )}
      {accept !== null ? (
        <AnswerSheet request={request} accept={accept} onClose={() => setAccept(null)} />
      ) : null}
    </Card>
  );
}

function Answered({ request }: { readonly request: LeaveRequestRecord }) {
  if (request.coverAnswer === 'accepted' || request.coverAnswer === 'declined') {
    const accepted = request.coverAnswer === 'accepted';
    return (
      <>
        <StatusPill
          size="sm"
          tone={accepted ? 'done' : 'overdue'}
          label={accepted ? COVER.youAccepted : COVER.youDeclined}
        />
        {request.coverNote ? (
          <Text variant="bodySm" tone="secondary">
            “{request.coverNote}”
          </Text>
        ) : null}
      </>
    );
  }
  return null;
}

function AnswerSheet({
  request,
  accept,
  onClose,
}: {
  readonly request: LeaveRequestRecord;
  readonly accept: boolean;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const [note, setNote] = useState('');
  const answer = useAnswerCover(request.id);
  const errors = fieldErrorsOf(answer.error);
  return (
    <Sheet
      open
      onClose={onClose}
      title={accept ? COVER.acceptTitle : COVER.declineTitle}
      description={accept ? COVER.acceptBody : COVER.declineBody}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={accept ? COVER.accept : COVER.decline}
          size="lg"
          pending={answer.isPending}
          onPress={() => {
            if (!answer.isPending) answer.mutate({ accept, note }, { onSuccess: onClose });
          }}
          fullWidth
        />
      }
    >
      <Field label={COVER.note} optional={accept ? COMMON.optional : undefined} error={errors.note}>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={accept ? undefined : COVER.notePlaceholder}
          accessibilityLabel={COVER.note}
          multiline
          maxLength={2000}
          invalid={Boolean(errors.note)}
        />
      </Field>
      {answer.error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {describeError(answer.error)}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  card: { gap: 8 },
  buttons: { flexDirection: 'row', gap: 8 },
});
