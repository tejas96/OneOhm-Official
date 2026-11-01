import type { FactFieldInfo, ProjectTask } from '@oneohm/api-contracts';
import { Card, Field, Input, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { DictationInput } from '@/features/dictation/dictation-input';
import { TaskDiscomField } from '@/features/discom/task-discom-field';
import { CableRunsField } from './cable-runs-field';

const KEYBOARD = { number: 'decimal-pad', date: 'numbers-and-punctuation' } as const;

interface FieldsProps {
  readonly fields: readonly FactFieldInfo[];
  readonly facts: Readonly<Record<string, string>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly onFact: (key: string, value: string) => void;
}

function FactFields({ fields, facts, errors, onFact }: FieldsProps) {
  return fields.map((field) => (
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
  ));
}

/**
 * The facts this task records, its measurements, then the note. Labels, input kinds
 * and hints come with the task from the API; the form starts with what the project
 * already knows.
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
  const measured = new Set(task.measurements);
  const captures = task.captureFields.filter((field) => !measured.has(field.key));
  const measurements = task.captureFields.filter((field) => measured.has(field.key));
  return (
    <Card style={styles.card}>
      <View style={styles.heading}>
        <Text variant="titleMd">{TASK.captureTitle}</Text>
        <Text variant="bodySm" tone="secondary">
          {task.captureFields.length > 0 ? TASK.captureBody : TASK.noCaptures}
        </Text>
      </View>
      <FactFields fields={captures} facts={facts} errors={errors} onFact={onFact} />
      <TaskDiscomField task={task} />
      {measurements.length > 0 ? (
        <View style={styles.heading}>
          <Text variant="label" tone="secondary">
            {TASK.measurementsTitle}
          </Text>
          <Text variant="bodySm" tone="secondary">
            {TASK.measurementsBody}
          </Text>
        </View>
      ) : null}
      <FactFields fields={measurements} facts={facts} errors={errors} onFact={onFact} />
      <CableRunsField task={task} facts={facts} onFact={onFact} />
      <Field label={TASK.note} optional={COMMON.optional}>
        <DictationInput
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
