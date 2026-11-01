import type { CustodyHolding, CustodyProject, MaterialSlip } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  EmptyState,
  ErrorState,
  LoadingState,
  StatusPill,
  Text,
  type Tone,
  useTheme,
} from '@oneohm/mobile-ui';
import { Package } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { CREW } from '@/copy/crew';
import { shortDate } from '@/lib/dates';
import { formatQuantity, useCrewMaterial } from './use-crew';
import { UseSheet } from './use-sheet';

const out = (holding: CustodyHolding) => holding.balance > 0.0005;
const KIND_TONE: Readonly<Record<MaterialSlip['kind'], Tone>> = {
  issue: 'waiting',
  use: 'done',
  return: 'neutral',
};

/** What the crew holds per project, recording usage, and the recent slips. */
export function MaterialSection() {
  const theme = useTheme();
  const query = useCrewMaterial();
  const [using, setUsing] = useState<CustodyProject | null>(null);
  if (query.isPending) return <LoadingState label={CREW.loading} />;
  if (query.isError)
    return (
      <ErrorState
        title={COMMON.loadError}
        message={describeError(query.error)}
        retryLabel={COMMON.retry}
        onRetry={() => void query.refetch()}
      />
    );
  const { projects, slips } = query.data;
  if (projects.length === 0)
    return (
      <EmptyState
        icon={<Package size={22} color={theme.colors.accent} />}
        title={CREW.material.emptyTitle}
        description={CREW.material.emptyBody}
      />
    );
  const holding = projects.filter((project) => project.holdings.some(out));
  const settled = projects.filter((project) => !project.holdings.some(out));
  return (
    <View style={styles.section}>
      <SectionTitle title={CREW.material.title} count={holding.length} />
      <Text variant="bodySm" tone="secondary">
        {CREW.material.hint}
      </Text>
      {holding.map((project) => (
        <ProjectCard key={project.project.id} project={project} onUse={() => setUsing(project)} />
      ))}
      {settled.map((project) => (
        <Card key={project.project.id} tone="sunken" style={styles.settled}>
          <Text variant="mono" tone="tertiary">
            {project.project.code}
          </Text>
          <Text variant="bodySm" tone="secondary">
            {CREW.material.accounted}
          </Text>
        </Card>
      ))}
      {slips.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title={CREW.material.historyTitle} count={Math.min(slips.length, 8)} />
          {slips.slice(0, 8).map((slip) => (
            <SlipRow key={slip.id} slip={slip} />
          ))}
        </View>
      ) : null}
      <UseSheet project={using} onClose={() => setUsing(null)} />
    </View>
  );
}

function ProjectCard({
  project,
  onUse,
}: {
  readonly project: CustodyProject;
  readonly onUse: () => void;
}) {
  const theme = useTheme();
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text variant="mono" tone="tertiary">
            {project.project.code}
          </Text>
          <Text variant="titleMd" numberOfLines={1}>
            {project.project.name}
          </Text>
        </View>
        {project.installed ? (
          <StatusPill size="sm" tone="done" label={CREW.material.installed} />
        ) : null}
      </View>
      {project.holdings
        .filter(out)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((holding) => (
          <View
            key={`${holding.productId}|${holding.lineKey ?? ''}`}
            style={[styles.holding, { borderTopColor: theme.colors.borderSubtle }]}
          >
            <View style={styles.row}>
              <Text variant="body" style={styles.grow} numberOfLines={2}>
                {holding.name}
              </Text>
              <Text variant="titleMd">
                {formatQuantity(holding.balance)} {holding.unit}
              </Text>
            </View>
            <View style={styles.row}>
              <Text variant="label" tone="tertiary" style={styles.grow}>
                {CREW.material.totals(
                  formatQuantity(holding.issued),
                  formatQuantity(holding.used),
                  formatQuantity(holding.returned),
                )}
              </Text>
              <Text variant="label" tone="tertiary">
                {CREW.material.withYou}
              </Text>
            </View>
          </View>
        ))}
      <Button label={CREW.material.recordUse} variant="secondary" onPress={onUse} fullWidth />
    </Card>
  );
}

function SlipRow({ slip }: { readonly slip: MaterialSlip }) {
  return (
    <Card style={styles.slip}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <StatusPill
            size="sm"
            tone={KIND_TONE[slip.kind]}
            label={CREW.material.kinds[slip.kind]}
          />
        </View>
        <Text variant="label" tone="secondary">
          {shortDate(slip.occurredOn)}
        </Text>
      </View>
      <Text variant="mono" tone="tertiary" numberOfLines={1}>
        {slip.number} · {slip.project.code}
      </Text>
      {slip.lines.map((line) => (
        <Text key={`${line.productId}|${line.lineKey ?? ''}`} variant="bodySm" tone="secondary">
          {CREW.material.line(formatQuantity(line.quantity), line.unit, line.name)}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  card: { gap: 12 },
  settled: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grow: { flex: 1 },
  holding: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  slip: { gap: 6, paddingVertical: 14 },
});
