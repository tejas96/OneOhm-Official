import {
  Button,
  ChoiceChips,
  Field,
  fieldErrorsOf,
  Input,
  LoadingState,
  Screen,
  unwrap,
} from '@oneohm/mobile-ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { ScreenHeader } from '@/components/screen-header';
import { REQUEST_LEAVE } from '@/copy/workforce';
import { useWorkday } from '@/features/attendance/use-workday';
import { ImpactCard } from './impact-card';
import { LeaveDays } from './leave-days';
import { useLeaveForm } from './use-leave-form';
import { useSendLeave } from './use-send-leave';

/** Ask for leave in a few taps, seeing its effect on work before sending (PRD 4.6). */
export function RequestLeaveScreen() {
  const workday = useWorkday();
  const balances = workday.data?.balances ?? [];
  const form = useLeaveForm(balances[0]?.leaveType ?? null);
  const [reason, setReason] = useState('');
  const [backupId, setBackupId] = useState<string | null>(null);
  const [handover, setHandover] = useState('');
  const window = form.window;

  const impact = useQuery({
    queryKey: ['leave-impact', window],
    queryFn: () => {
      if (!window) throw new Error(REQUEST_LEAVE.pickDays);
      return unwrap(api.workforce.leaveImpact({ body: window }));
    },
    enabled: window !== null,
    placeholderData: keepPreviousData,
  });
  const send = useSendLeave(window, {
    reason,
    emergency: form.kind === 'emergency',
    backupUserId: backupId,
    handover,
  });
  const errors = send.error ? fieldErrorsOf(send.error) : {};
  const shown = window ? impact.data : undefined;

  return (
    <Screen
      footer={
        <Button
          label={REQUEST_LEAVE.send}
          onPress={() => send.mutate()}
          pending={send.isPending}
          disabled={!shown || shown.halfDays === 0}
          fullWidth
        />
      }
    >
      <ScreenHeader title={REQUEST_LEAVE.title} />
      {workday.isPending ? <LoadingState label={REQUEST_LEAVE.checking} /> : null}
      <View style={styles.form}>
        <Field label={REQUEST_LEAVE.kind}>
          <ChoiceChips
            label={REQUEST_LEAVE.kind}
            choices={balances.map((balance) => ({
              value: balance.leaveType,
              label: balance.label,
            }))}
            value={form.type}
            onChange={form.setLeaveType}
          />
        </Field>
        <LeaveDays form={form} />
        {shown ? <ImpactCard impact={shown} backupId={backupId} onBackup={setBackupId} /> : null}
        {shown && shown.tasks.length > 0 ? (
          <Field
            label={REQUEST_LEAVE.handover}
            hint={REQUEST_LEAVE.handoverHint}
            error={errors.handoverNote}
          >
            <Input
              value={handover}
              onChangeText={setHandover}
              accessibilityLabel={REQUEST_LEAVE.handover}
              multiline
            />
          </Field>
        ) : null}
        <Field label={REQUEST_LEAVE.reason} error={errors.reason}>
          <Input
            value={reason}
            onChangeText={setReason}
            accessibilityLabel={REQUEST_LEAVE.reason}
            multiline
          />
        </Field>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 18 },
});
