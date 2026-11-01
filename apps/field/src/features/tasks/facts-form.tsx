import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, Field, Input, Text, useTheme } from '@oneohm/mobile-ui';
import { Camera, FileText, ListChecks, Ruler, Signature } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { factLabel, TASK } from '@/copy/tasks';

const NUMERIC = /(meters|count|wattage|kw|resistance|floors|efficiency|capacity)$/;

/** The facts this task records, then the note; field errors come from the API. */
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
          {task.captures.length > 0 ? TASK.captureBody : TASK.noCaptures}
        </Text>
      </View>
      {task.captures.map((key) => (
        <Field key={key} label={factLabel(key)} error={errors[key]}>
          <Input
            value={facts[key] ?? ''}
            onChangeText={(value) => onFact(key, value)}
            invalid={Boolean(errors[key])}
            keyboardType={NUMERIC.test(key) ? 'decimal-pad' : 'default'}
            accessibilityLabel={factLabel(key)}
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

const EVIDENCE_ICONS = {
  photo: Camera,
  document: FileText,
  measurement: Ruler,
  checklist: ListChecks,
  signature: Signature,
} as const;

/**
 * The evidence this task asks for. Uploading arrives with the documents API; until
 * then the screen says so plainly instead of pretending to attach anything.
 */
export function EvidenceNotice({ task }: { readonly task: ProjectTask }) {
  const theme = useTheme();
  if (task.evidence.length === 0) return null;
  return (
    <Card tone="sunken" style={styles.card}>
      <Text variant="titleMd">{TASK.evidenceTitle}</Text>
      <View style={styles.kinds}>
        {task.evidence.map((kind) => {
          const Icon = EVIDENCE_ICONS[kind as keyof typeof EVIDENCE_ICONS] ?? FileText;
          return (
            <View key={kind} style={[styles.kind, { backgroundColor: theme.colors.surfaceRaised }]}>
              <Icon size={16} color={theme.colors.textSecondary} />
              <Text variant="label" tone="secondary">
                {TASK.evidenceKinds[kind as keyof typeof TASK.evidenceKinds] ?? kind}
              </Text>
            </View>
          );
        })}
      </View>
      {/* EVIDENCE UPLOAD: wire the camera / document picker here once the documents API exists. */}
      <Text variant="bodySm" tone="secondary">
        {TASK.evidencePending}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  heading: { gap: 4 },
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
});
