import type { ProjectTask } from '@oneohm/api-contracts';
import {
  CABLE_ROUTES,
  CABLE_RUNS_FACT,
  type CableRouteKind,
  type CableRunInput,
  cableTotal,
  formatCableRuns,
  parseCableRuns,
} from '@oneohm/domain';
import { Button, ChoiceChips, Field, Input, Text, useTheme } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CABLE_RUNS } from '@/copy/costing';

interface Row {
  readonly kind: CableRouteKind;
  readonly floor: string;
  readonly across: string;
  readonly up: string;
  readonly runs: string;
}

const BLANK: Row = { kind: 'dc', floor: '', across: '', up: '', runs: '2' };
const number = (text: string) => {
  const value = Number.parseFloat(text.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : 0;
};
const toRow = (run: CableRunInput): Row => ({
  kind: run.kind,
  floor: run.floor === null || run.floor === undefined ? '' : String(run.floor),
  across: String(run.acrossM),
  up: String(run.upM),
  runs: String(run.runs),
});
const toRun = (row: Row): CableRunInput => ({
  kind: row.kind,
  floor: row.floor.trim() === '' ? null : Math.round(number(row.floor)),
  acrossM: number(row.across),
  upM: number(row.up),
  runs: Math.max(1, Math.round(number(row.runs))),
});

/**
 * Cable runs measured floor by floor and route by route on a survey (PRD 3.4, B3). They
 * are saved as one fact the price engine reads run by run, and they fill in the DC and
 * AC lengths the survey also records. Shown only on tasks that capture cable lengths.
 */
export function CableRunsField({
  task,
  facts,
  onFact,
}: {
  readonly task: ProjectTask;
  readonly facts: Readonly<Record<string, string>>;
  readonly onFact: (key: string, value: string) => void;
}) {
  const { colors } = useTheme();
  const [rows, setRows] = useState<Row[]>(() =>
    parseCableRuns(facts[CABLE_RUNS_FACT] ?? '').runs.map(toRow),
  );
  if (!task.captures.includes('dc_cable_meters')) return null;

  const change = (next: Row[]) => {
    setRows(next);
    const runs = next.map(toRun).filter((run) => run.acrossM + run.upM > 0);
    onFact(CABLE_RUNS_FACT, formatCableRuns(runs));
    for (const kind of ['dc', 'ac'] as const) {
      if (runs.some((run) => run.kind === kind))
        onFact(`${kind}_cable_meters`, String(cableTotal(runs, kind)));
    }
  };
  const update = (index: number, patch: Partial<Row>) =>
    change(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));
  const runs = rows.map(toRun);

  return (
    <View style={styles.block}>
      <View style={styles.heading}>
        <Text variant="label">{CABLE_RUNS.title}</Text>
        <Text variant="bodySm" tone="secondary">
          {CABLE_RUNS.body}
        </Text>
      </View>
      {rows.map((row, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: runs are edited in place by position
        <View key={index} style={[styles.run, { borderColor: colors.borderStrong }]}>
          <ChoiceChips
            kind="segmented"
            label={CABLE_RUNS.kind}
            value={row.kind}
            onChange={(kind) => update(index, { kind })}
            choices={CABLE_ROUTES.map((value) => ({ value, label: CABLE_RUNS.kinds[value] }))}
          />
          <View style={styles.numbers}>
            {(['floor', 'across', 'up', 'runs'] as const).map((key) => (
              <View key={key} style={styles.number}>
                <Field label={CABLE_RUNS[key]}>
                  <Input
                    value={row[key]}
                    onChangeText={(value) => update(index, { [key]: value })}
                    keyboardType="decimal-pad"
                    accessibilityLabel={CABLE_RUNS[key]}
                  />
                </Field>
              </View>
            ))}
          </View>
          <Button
            label={CABLE_RUNS.remove}
            variant="quiet"
            size="sm"
            onPress={() => change(rows.filter((_, at) => at !== index))}
          />
        </View>
      ))}
      {rows.length > 0 ? (
        <Text variant="bodySm" tone="secondary">
          {CABLE_RUNS.totals(cableTotal(runs, 'dc'), cableTotal(runs, 'ac'))}
        </Text>
      ) : null}
      <Button label={CABLE_RUNS.add} variant="secondary" onPress={() => change([...rows, BLANK])} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 12 },
  heading: { gap: 4 },
  run: { gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  numbers: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  number: { flexBasis: '45%', flexGrow: 1 },
});
