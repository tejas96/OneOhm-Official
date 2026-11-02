import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Sheet,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useState } from 'react';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { DictationInput } from '@/features/dictation/dictation-input';

const WORDS = { update: TASK.updateSheet, sendBack: TASK.sendBackSheet } as const;
/** The server's limits (task-flow schema): an update needs 2 letters, a send-back 3. */
const LIMITS = { update: { min: 2, max: 1000 }, sendBack: { min: 3, max: 500 } } as const;

/**
 * One short text for a task: a progress update for the project history, or what to fix
 * when a reviewer sends the work back. The text stays if saving fails.
 */
export function NoteSheet({
  kind,
  open,
  pending,
  error,
  onClose,
  onSave,
}: {
  readonly kind: keyof typeof WORDS;
  readonly open: boolean;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onSave: (text: string) => void;
}) {
  const words = WORDS[kind];
  const limit = LIMITS[kind];
  const theme = useTheme();
  const [text, setText] = useState('');
  const field = fieldErrorsOf(error)[kind === 'update' ? 'note' : 'reason'];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={words.title}
      description={words.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={words.save}
          size="lg"
          variant={kind === 'sendBack' ? 'secondary' : 'primary'}
          pending={pending}
          disabled={text.trim().length < limit.min}
          onPress={() => {
            if (!pending && text.trim().length >= limit.min) onSave(text);
          }}
          fullWidth
        />
      }
    >
      <Field label={words.label} error={field}>
        <DictationInput
          value={text}
          onChangeText={setText}
          placeholder={words.placeholder}
          multiline
          maxLength={limit.max}
          invalid={Boolean(field)}
          accessibilityLabel={words.label}
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
