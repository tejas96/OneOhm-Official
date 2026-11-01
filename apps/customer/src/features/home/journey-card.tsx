import type { CustomerProject } from '@oneohm/api-contracts';
import { Card, formatKwp, ProgressRing, Text, useTheme } from '@oneohm/mobile-ui';
import { Check, Sun } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { HOME, STAGE_MEANING } from '@/copy/home';
import { isLive, stepProgress } from '@/lib/journey';

type Stage = CustomerProject['stages'][number];

/**
 * The hero: the whole journey as a calm vertical path. Done steps are ticked, the
 * current step says in one line what is happening, and steps that do not apply to
 * this home are left out.
 */
export function JourneyCard({ project }: { readonly project: CustomerProject }) {
  const theme = useTheme();
  const steps = project.stages.filter((stage) => stage.state !== 'skipped');
  const { done, total } = stepProgress(project.stages);
  const live = isLive(project);
  return (
    <Card tone="panel" style={styles.card}>
      <View style={styles.top}>
        <View style={styles.heading}>
          <Text variant="overline" tone="onPanelMuted">
            {HOME.journeyTitle.toUpperCase()}
          </Text>
          <Text variant="titleLg" tone="onPanel">
            {HOME.system(formatKwp(project.capacityWp), project.place)}
          </Text>
          <Text variant="bodySm" tone="onPanelMuted">
            {HOME.stageCount(done, total)}
          </Text>
        </View>
        <ProgressRing
          value={total ? done / total : 0}
          size={68}
          thickness={6}
          label={HOME.stageCount(done, total)}
        >
          <Text variant="mono" tone="onPanel">
            {`${done}/${total}`}
          </Text>
        </ProgressRing>
      </View>

      {live ? (
        <View style={[styles.live, { backgroundColor: theme.colors.energySoft }]}>
          <Sun size={20} color={theme.colors.energy} />
          <View style={styles.liveText}>
            <Text variant="titleMd" color={theme.colors.energy}>
              {HOME.live}
            </Text>
            <Text variant="bodySm" tone="secondary">
              {HOME.liveBody}
            </Text>
          </View>
        </View>
      ) : null}

      <View accessibilityRole="list">
        {steps.map((step, index) => (
          <StepRow key={step.stage} step={step} last={index === steps.length - 1} />
        ))}
      </View>
    </Card>
  );
}

function StepRow({ step, last }: { readonly step: Stage; readonly last: boolean }) {
  const theme = useTheme();
  const done = step.state === 'done';
  const current = step.state === 'current';
  const name = COMMON.stages[step.stage];
  return (
    <View style={styles.row} accessibilityLabel={`${name}: ${step.state}`}>
      <View style={styles.rail}>
        <View
          style={[
            styles.dot,
            done && { backgroundColor: theme.colors.energy, borderColor: theme.colors.energy },
            current && { borderColor: theme.colors.accent, borderWidth: 2 },
            !done && !current && { borderColor: theme.colors.borderStrong },
          ]}
        >
          {done ? <Check size={14} color={theme.colors.onAccent} strokeWidth={3} /> : null}
          {current ? (
            <View style={[styles.core, { backgroundColor: theme.colors.accent }]} />
          ) : null}
        </View>
        {last ? null : (
          <View
            style={[
              styles.line,
              { backgroundColor: done ? theme.colors.energy : theme.colors.panelLine },
            ]}
          />
        )}
      </View>
      <View style={[styles.body, last && styles.lastBody]}>
        <View style={styles.nameRow}>
          <Text
            variant={current ? 'titleMd' : 'body'}
            tone={done || current ? 'onPanel' : 'onPanelMuted'}
          >
            {name}
          </Text>
          {current ? (
            <View style={[styles.now, { backgroundColor: theme.colors.accentSoft }]}>
              <Text variant="label" color={theme.colors.onAccentSoft}>
                {HOME.now}
              </Text>
            </View>
          ) : null}
        </View>
        {current ? (
          <Text variant="bodySm" tone="onPanelMuted">
            {STAGE_MEANING[step.stage]}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const DOT = 26;

const styles = StyleSheet.create({
  card: { gap: 18, padding: 20 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  heading: { flex: 1, gap: 4 },
  live: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, alignItems: 'flex-start' },
  liveText: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', gap: 14 },
  rail: { width: DOT, alignItems: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: { width: 10, height: 10, borderRadius: 5 },
  line: { width: 2, flex: 1, minHeight: 14, borderRadius: 1, marginVertical: 3 },
  body: { flex: 1, gap: 4, paddingTop: 2, paddingBottom: 18 },
  lastBody: { paddingBottom: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  now: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
});
