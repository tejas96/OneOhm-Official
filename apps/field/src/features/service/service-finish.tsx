import type { ServiceVisit } from '@oneohm/api-contracts';
import { SERVICE_NOTE_MAX } from '@oneohm/domain';
import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { SERVICE } from '@/copy/service';

/** The two ways to finish: done (primary) or hand back; both wait for uploads. */
export function FinishFooter({
  uploading,
  pending,
  onDone,
  onHandBack,
}: {
  readonly uploading: boolean;
  readonly pending: boolean;
  readonly onDone: () => void;
  readonly onHandBack: () => void;
}) {
  return (
    <View style={styles.footer}>
      {uploading ? (
        <Text variant="label" tone="secondary" style={styles.center}>
          {SERVICE.waitUploads}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={SERVICE.handBack}
          variant="secondary"
          size="lg"
          disabled={uploading || pending}
          onPress={onHandBack}
          style={styles.back}
        />
        <Button
          label={SERVICE.done}
          size="lg"
          pending={pending}
          disabled={uploading}
          onPress={onDone}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

/** Hand the request back to the desk with the reason it could not be finished. */
export function HandBackSheet({
  visit,
  open,
  pending,
  error,
  onClose,
  onSend,
}: {
  readonly visit: ServiceVisit;
  readonly open: boolean;
  readonly pending: boolean;
  /** The last failed send, shown here in front of the screen. */
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onSend: (reason: string) => void;
}) {
  const theme = useTheme();
  const [reason, setReason] = useState('');
  const fieldError = fieldErrorsOf(error).reason;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={SERVICE.handBackTitle}
      description={SERVICE.handBackBody}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={SERVICE.sendHandBack}
          size="lg"
          pending={pending}
          disabled={reason.trim().length === 0}
          onPress={() => {
            if (!pending && reason.trim()) onSend(reason.trim());
          }}
          fullWidth
        />
      }
    >
      <Text variant="bodySm" tone="secondary">
        {`${visit.categoryLabel} · ${visit.customer.name}`}
      </Text>
      <Field label={SERVICE.reason} hint={SERVICE.reasonHint} error={fieldError}>
        <Input
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={SERVICE_NOTE_MAX}
          invalid={Boolean(fieldError)}
          accessibilityLabel={SERVICE.reason}
        />
      </Field>
      {error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {describeError(error)}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  footer: { gap: 8 },
  row: { flexDirection: 'row', gap: 10 },
  back: { flexBasis: 120 },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});
