import type { ServiceVisit } from '@oneohm/api-contracts';
import { SERVICE_NOTE_MAX } from '@oneohm/domain';
import { Card, Field, Input, StatusPill, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { SERVICE } from '@/copy/service';
import { shortMoment } from '@/lib/dates';

export interface ReportDraft {
  readonly found: string;
  readonly workDone: string;
}

/** What the technician found and did; the second becomes the customer's closing note. */
export function ReportForm({
  draft,
  errors,
  onChange,
}: {
  readonly draft: ReportDraft;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (draft: ReportDraft) => void;
}) {
  return (
    <Card style={styles.card}>
      <Text variant="titleMd">{SERVICE.report}</Text>
      <Field label={SERVICE.found} hint={SERVICE.foundHint} error={errors.found}>
        <Input
          value={draft.found}
          onChangeText={(found) => onChange({ ...draft, found })}
          multiline
          maxLength={SERVICE_NOTE_MAX}
          accessibilityLabel={SERVICE.found}
        />
      </Field>
      <Field label={SERVICE.workDone} hint={SERVICE.workDoneHint} error={errors.workDone}>
        <Input
          value={draft.workDone}
          onChangeText={(workDone) => onChange({ ...draft, workDone })}
          multiline
          maxLength={SERVICE_NOTE_MAX}
          invalid={Boolean(errors.workDone)}
          accessibilityLabel={SERVICE.workDone}
        />
      </Field>
    </Card>
  );
}

/** What was written when the work was finished or handed back, newest first. */
export function ReportHistory({ visit }: { readonly visit: ServiceVisit }) {
  if (visit.reports.length === 0) return null;
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {SERVICE.history.toUpperCase()}
      </Text>
      {visit.reports.map((report) => (
        <View key={report.id} style={styles.entry}>
          <View style={styles.head}>
            <StatusPill
              size="sm"
              tone={report.outcome === 'done' ? 'done' : 'waiting'}
              label={report.outcome === 'done' ? SERVICE.finishedTitle : SERVICE.handedBack}
            />
            <Text variant="label" tone="tertiary" style={styles.shrink}>
              {SERVICE.reportBy(report.user.fullName, shortMoment(report.createdAt))}
            </Text>
          </View>
          {report.found ? <Line label={SERVICE.found} text={report.found} /> : null}
          {report.workDone ? <Line label={SERVICE.workDone} text={report.workDone} /> : null}
          {report.reason ? <Text variant="bodySm">{SERVICE.reasonLine(report.reason)}</Text> : null}
        </View>
      ))}
    </Card>
  );
}

function Line({ label, text }: { readonly label: string; readonly text: string }) {
  return (
    <View style={styles.line}>
      <Text variant="label" tone="tertiary">
        {label}
      </Text>
      <Text variant="bodySm">{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  entry: { gap: 8 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  shrink: { flexShrink: 1 },
  line: { gap: 2 },
});
