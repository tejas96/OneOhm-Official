import type { CustomerHome, CustomerProject } from '@oneohm/api-contracts';
import {
  Button,
  Card,
  describeError,
  EmptyState,
  ErrorState,
  formatInr,
  LoadingState,
  Screen,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { IndianRupee, Phone } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { PAYMENTS } from '@/copy/money';
import { ProjectSwitcher } from '@/features/home/project-switcher';
import { useChosenProject, useHome } from '@/features/home/use-home';
import { dialDigits, percentPaid } from '@/lib/journey';
import { BillingSection } from './billing-section';
import { MilestoneRow } from './milestone-row';
import { useBilling } from './use-billing';

/** What the project costs, what is paid, what is due, and how to pay. */
export function PaymentsScreen() {
  const theme = useTheme();
  const query = useHome();
  const billing = useBilling();
  const { project, choose } = useChosenProject(query.data?.projects);
  const refresh = () => {
    void query.refetch();
    void billing.refetch();
  };
  return (
    <Screen refreshing={query.isRefetching || billing.isRefetching} onRefresh={refresh}>
      <Text variant="displayLg" style={styles.title}>
        {PAYMENTS.title}
      </Text>
      {query.isPending ? <LoadingState label={PAYMENTS.loading} /> : null}
      {query.isError ? (
        <ErrorState
          title={COMMON.loadError}
          message={describeError(query.error)}
          retryLabel={COMMON.retry}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {query.data && !project ? (
        <EmptyState
          icon={<IndianRupee size={22} color={theme.colors.accent} />}
          title={PAYMENTS.noProject}
        />
      ) : null}
      {project && query.data ? (
        <>
          <ProjectSwitcher projects={query.data.projects} chosenId={project.id} onChoose={choose} />
          <Summary project={project} />
          <EffectiveCost project={project} />
          <View style={styles.section}>
            <SectionTitle title={PAYMENTS.scheduleTitle.toUpperCase()} />
            <Card style={styles.schedule}>
              {project.payments.milestones.map((line, index) => (
                <MilestoneRow key={`${line.label}-${line.payer}`} line={line} first={index === 0} />
              ))}
            </Card>
          </View>
          <BillingSection projectId={project.id} />
          <HowToPay home={query.data} project={project} />
          {project.subsidy.status !== 'not_applicable' && project.subsidy.amountPaise > 0 ? (
            <Text variant="bodySm" tone="tertiary">
              {PAYMENTS.subsidyNote(formatInr(project.subsidy.amountPaise))}
            </Text>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Summary({ project }: { readonly project: CustomerProject }) {
  const theme = useTheme();
  const { totalPaise, paidPaise } = project.payments;
  const percent = percentPaid(project.payments);
  const remaining = Math.max(0, totalPaise - paidPaise);
  return (
    <Card tone="panel" style={styles.summary}>
      <Text variant="overline" tone="onPanelMuted">
        {PAYMENTS.paidOf(formatInr(paidPaise), formatInr(totalPaise)).toUpperCase()}
      </Text>
      <Text variant="displayXl" tone="onPanel">
        {formatInr(paidPaise)}
      </Text>
      <View
        style={[styles.track, { backgroundColor: theme.colors.panelLine }]}
        accessibilityRole="progressbar"
        accessibilityLabel={PAYMENTS.progressLabel(percent)}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View
          style={[styles.bar, { width: `${percent}%`, backgroundColor: theme.colors.energy }]}
        />
      </View>
      <Text variant="body" tone="onPanelMuted">
        {remaining > 0 ? `${PAYMENTS.remaining}: ${formatInr(remaining)}` : PAYMENTS.allPaid}
      </Text>
    </Card>
  );
}

/** Price − expected subsidy = what the customer really pays, in one line (PRD 5.3). */
function EffectiveCost({ project }: { readonly project: CustomerProject }) {
  const price = project.payments.totalPaise;
  const subsidy = project.subsidy.amountPaise;
  if (project.subsidy.status === 'not_applicable' || subsidy <= 0 || price <= 0) return null;
  return (
    <Text variant="body" tone="secondary" style={styles.effective}>
      {PAYMENTS.effectiveCost(formatInr(price), formatInr(subsidy), formatInr(price - subsidy))}
    </Text>
  );
}

function HowToPay({
  home,
  project,
}: {
  readonly home: CustomerHome;
  readonly project: CustomerProject;
}) {
  const theme = useTheme();
  const phone = project.contact?.phone ?? home.company.phones[0] ?? null;
  const name = project.contact?.name ?? home.company.name;
  return (
    <Card tone="sunken" style={styles.howTo}>
      <Text variant="titleMd">{PAYMENTS.howToPayTitle}</Text>
      <Text variant="bodySm" tone="secondary">
        {PAYMENTS.howToPayBody}
      </Text>
      {phone ? (
        <Button
          label={PAYMENTS.callContact(name)}
          variant="secondary"
          size="sm"
          icon={<Phone size={16} color={theme.colors.textPrimary} />}
          onPress={() => void Linking.openURL(`tel:+${dialDigits(phone)}`)}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { paddingTop: 8 },
  section: { gap: 10 },
  schedule: { paddingVertical: 4 },
  summary: { gap: 10, padding: 20 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  howTo: { gap: 10 },
  effective: { paddingHorizontal: 4 },
});
