import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { CORRECTION } from '@/copy/workforce';
import { businessToday } from '@/lib/dates';

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** "09:25" today in India time, as an instant; null when blank, 'bad' when not a time. */
function instantOf(time: string, date: string): string | null | 'bad' {
  const value = time.trim();
  if (!value) return null;
  const match = TIME.exec(value);
  if (!match) return 'bad';
  const hh = (match[1] ?? '').padStart(2, '0');
  return new Date(`${date}T${hh}:${match[2]}:00+05:30`).toISOString();
}

/** What is wrong with the typed times: not a time, still to come, or out before in. */
function timeProblems(
  inAt: string | null | 'bad',
  outAt: string | null | 'bad',
  now: string,
): { inError: string | undefined; outError: string | undefined } {
  const inError =
    inAt === 'bad' ? CORRECTION.badTime : inAt && inAt > now ? CORRECTION.notYet : undefined;
  let outError: string | undefined;
  if (outAt === 'bad') outError = CORRECTION.badTime;
  else if (outAt && outAt > now) outError = CORRECTION.notYet;
  else if (outAt && inAt && inAt !== 'bad' && outAt <= inAt) outError = CORRECTION.outBeforeIn;
  return { inError, outError };
}

/** "I forgot to check out": the right times and why; a manager approves (PRD 4.3). */
export function CorrectionSheet({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const toast = useToast();
  const theme = useTheme();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const date = businessToday();
  const inAt = instantOf(checkIn, date);
  const outAt = instantOf(checkOut, date);
  const { inError, outError } = timeProblems(inAt, outAt, new Date().toISOString());
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.workforce.requestCorrection({
          body: {
            workDate: date,
            checkInAt: inAt === 'bad' ? null : inAt,
            checkOutAt: outAt === 'bad' ? null : outAt,
            reason: reason.trim(),
          },
        }),
      ),
    onSuccess: () => {
      toast(CORRECTION.sent);
      setCheckIn('');
      setCheckOut('');
      setReason('');
      onClose();
    },
  });
  // A failure shows once, in the sheet: the sentence below, field messages in place.
  const errors = send.error ? fieldErrorsOf(send.error) : {};
  const ready = Boolean(inAt || outAt) && !inError && !outError && reason.trim().length >= 5;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={CORRECTION.title}
      description={CORRECTION.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={CORRECTION.send}
          onPress={() => {
            if (ready && !send.isPending) send.mutate();
          }}
          pending={send.isPending}
          disabled={!ready}
          fullWidth
        />
      }
    >
      <View style={styles.form}>
        <View style={styles.row}>
          <View style={styles.half}>
            <Field
              label={CORRECTION.checkIn}
              hint={CORRECTION.timeHint}
              error={inError ?? errors.checkInAt}
              optional={COMMON.optional}
            >
              <Input
                value={checkIn}
                onChangeText={setCheckIn}
                maxLength={5}
                invalid={Boolean(inError ?? errors.checkInAt)}
                accessibilityLabel={CORRECTION.checkIn}
                mono
              />
            </Field>
          </View>
          <View style={styles.half}>
            <Field
              label={CORRECTION.checkOut}
              error={outError ?? errors.checkOutAt}
              optional={COMMON.optional}
            >
              <Input
                value={checkOut}
                onChangeText={setCheckOut}
                maxLength={5}
                invalid={Boolean(outError ?? errors.checkOutAt)}
                accessibilityLabel={CORRECTION.checkOut}
                mono
              />
            </Field>
          </View>
        </View>
        <Field label={CORRECTION.reason} hint={CORRECTION.reasonHint} error={errors.reason}>
          <Input
            value={reason}
            onChangeText={setReason}
            accessibilityLabel={CORRECTION.reason}
            multiline
            maxLength={500}
            invalid={Boolean(errors.reason)}
          />
        </Field>
        {send.error ? (
          <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
            {describeError(send.error)}
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
});
