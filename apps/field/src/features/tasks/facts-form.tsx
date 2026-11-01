import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, Field, Input, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';

const KEYBOARD = { number: 'decimal-pad', date: 'numbers-and-punctuation' } as const;

/**
 * The facts this task records, then the note. Labels, input kinds and hints come with
 * the task from the API; the form starts with what the project already knows.
 */
export function FactsForm({
  task,
  facts,
  note,
  errors,
  onFact,
  onNote,
}: {
  readonly task: ProjectTask;
  readonly facts: Readonly<Record<string, string>>;
  readonly note: string;
  readonly errors: Readonly<Record<string, string>>;
  readonly onFact: (key: string, value: string) => void;
  readonly onNote: (value: string) => void;
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleMd">{TASK.captureTitle}</Text>
        <Text variant="bodySm" tone="secondary">
          {task.captureFields.length > 0 ? TASK.captureBody : TASK.noCaptures}
        </Text>
      </View>
      {task.captureFields.map((field) => (
        <Field
          key={field.key}
          label={field.label}
          hint={field.input === 'date' ? (field.hint ?? TASK.dateHint) : field.hint}
          error={errors[field.key]}
        >
          <Input
            value={facts[field.key] ?? ''}
            onChangeText={(value) => onFact(field.key, value)}
            invalid={Boolean(errors[field.key])}
            multiline={field.input === 'long'}
            keyboardType={
              field.input === 'number' || field.input === 'date' ? KEYBOARD[field.input] : 'default'
            }
            accessibilityLabel={field.label}
          />
        </Field>
      ))}
      <Field label={TASK.note} optional={COMMON.optional}>
        <Input
          value={note}
          onChangeText={onNote}
          placeholder={TASK.notePlaceholder}
          multiline
          accessibilityLabel={TASK.note}
        />
      </Field>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { gap: 4 },
});
