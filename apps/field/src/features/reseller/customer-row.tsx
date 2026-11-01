import type { ResellerCustomer } from '@oneohm/api-contracts';
import { Card, formatInr, StatusPill, Text, type Tone } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { COMMON } from '@/copy/common';
import { RESELLER_CUSTOMERS } from '@/copy/reseller';
import { LEADS } from '@/copy/sales';
import { CommissionPill } from './commission-pill';
import { ProgressBar } from './progress-bar';
import { kwOf } from './use-reseller';

const LEAD_TONE: Readonly<Record<ResellerCustomer['leadStage'], Tone>> = {
  new: 'review',
  contacted: 'neutral',
  survey_scheduled: 'onTrack',
  quoted: 'waiting',
  won: 'done',
  lost: 'neutral',
};

function ProjectLine({ customer }: { readonly customer: ResellerCustomer }) {
  const project = customer.project;
  if (!project) {
    return (
      <View style={styles.between}>
        <StatusPill
          size="sm"
          tone={LEAD_TONE[customer.leadStage]}
          label={LEADS.stage[customer.leadStage]}
        />
        <Text variant="label" tone="tertiary">
          {RESELLER_CUSTOMERS.noProject}
        </Text>
      </View>
    );
  }
  const percent = Math.round(project.progressBp / 100);
  const where =
    project.status === 'cancelled'
      ? RESELLER_CUSTOMERS.cancelled
      : project.status === 'operational' || project.status === 'completed'
        ? RESELLER_CUSTOMERS.installed
        : RESELLER_CUSTOMERS.stage(COMMON.stages[project.currentStage]);
  return (
    <View style={styles.project}>
      <View style={styles.between}>
        <Text variant="bodySm" tone="secondary">
          {where}
        </Text>
        <Text variant="label" tone="tertiary">
          {RESELLER_CUSTOMERS.progress(percent)}
        </Text>
      </View>
      <ProgressBar
        value={percent}
        label={RESELLER_CUSTOMERS.progressLabel(customer.name, percent)}
      />
    </View>
  );
}

/** One of the reseller's customers: who, the project's progress and their commission. */
export function CustomerRow({ customer }: { readonly customer: ResellerCustomer }) {
  const project = customer.project;
  return (
    <Card style={styles.card} accessibilityLabel={customer.name}>
      <View style={styles.flex}>
        <Text variant="titleMd" numberOfLines={1}>
          {customer.name}
        </Text>
        <Text variant="bodySm" tone="secondary" numberOfLines={1}>
          {project
            ? `${customer.city} · ${RESELLER_CUSTOMERS.project(project.code, kwOf(project.capacityWp))}`
            : customer.city}
        </Text>
      </View>
      <ProjectLine customer={customer} />
      {customer.commission ? (
        <View style={styles.between}>
          <Text variant="label" tone="secondary">
            {RESELLER_CUSTOMERS.commission(formatInr(customer.commission.amountPaise))}
          </Text>
          <CommissionPill status={customer.commission.status} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, paddingVertical: 16 },
  flex: { gap: 2 },
  project: { gap: 6 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
