import { Button, describeError, Field, fieldErrorsOf, Sheet } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { DictationInput } from '@/features/dictation/dictation-input';

const WORDS = { update: TASK.updateSheet, sendBack: TASK.sendBackSheet } as const;

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
          disabled={text.trim().length < 2}
          onPress={() => onSave(text)}
          fullWidth
        />
      }
    >
      <Field label={words.label} error={field ?? (error ? describeError(error) : undefined)}>
        <DictationInput
          value={text}
          onChangeText={setText}
          placeholder={words.placeholder}
          multiline
          accessibilityLabel={words.label}
        />
      </Field>
    </Sheet>
  );
}
