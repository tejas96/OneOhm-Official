import type { ServiceVisit } from '@oneohm/api-contracts';
import { finishProblems } from '@oneohm/domain';
import {
  describeError,
  EmptyState,
  fieldErrorsOf,
  LoadingState,
  Screen,
  StatusPill,
  Text,
  type Tone,
  useTheme,
} from '@oneohm/mobile-ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { SERVICE } from '@/copy/service';
import { ServiceCheckInCard } from './service-check-in-card';
import { ServiceEvidence, useServiceUploads } from './service-evidence';
import { PlaceCard, ProblemCard, PromisesCard } from './service-facts';
import { FinishFooter, HandBackSheet } from './service-finish';
import { type ReportDraft, ReportForm, ReportHistory } from './service-report';
import { useFinishService, useServiceVisit } from './use-service-visits';

const STATUS_TONE: Readonly<Record<ServiceVisit['status'], Tone>> = {
  open: 'review',
  in_progress: 'onTrack',
  resolved: 'done',
};

/** One service request from the technician's phone (PRD 5.5). */
export function ServiceVisitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useServiceVisit(id);
  if (query.isPending)
    return (
      <Screen>
        <LoadingState label={SERVICE.loading} />
      </Screen>
    );
  if (!query.data) {
    return (
      <Screen>
        <ScreenHeader title={SERVICE.sectionTitle} />
        <EmptyState title={SERVICE.notFound} description={describeError(query.error)} />
      </Screen>
    );
  }
  return <VisitDetail key={query.data.id} visit={query.data} />;
}

function VisitDetail({ visit }: { readonly visit: ServiceVisit }) {
  const theme = useTheme();
  const toast = useToast();
  const finish = useFinishService(visit.id);
  const { uploading } = useServiceUploads(visit.id);
  const [draft, setDraft] = useState<ReportDraft>({ found: '', workDone: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [handingBack, setHandingBack] = useState(false);
  const serverErrors = fieldErrorsOf(finish.error);

  const markDone = () => {
    if (finish.isPending) return;
    const problems = finishProblems({ outcome: 'done', ...draft });
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      finish.reset();
      return;
    }
    // A failure shows once, under the report (no toast as well).
    finish.mutate(
      { finish: { outcome: 'done', ...draft }, tracking: visit.tracking },
      { onSuccess: () => toast(SERVICE.doneConfirm) },
    );
  };
  const openHandBack = () => {
    finish.reset();
    setHandingBack(true);
  };
  const handBack = (reason: string) => {
    if (finish.isPending) return;
    finish.mutate(
      { finish: { outcome: 'handed_back', reason, ...draft }, tracking: visit.tracking },
      {
        onSuccess: () => {
          setHandingBack(false);
          toast(SERVICE.handBackConfirm);
          if (router.canGoBack()) router.back();
        },
      },
    );
  };

  const footer = visit.canWork ? (
    <FinishFooter
      uploading={uploading}
      pending={finish.isPending}
      onDone={markDone}
      onHandBack={openHandBack}
    />
  ) : undefined;

  return (
    <Screen footer={footer}>
      <ScreenHeader overline={SERVICE.overline(visit.projectCode)} title={visit.categoryLabel} />
      <View style={styles.meta}>
        <StatusPill tone={STATUS_TONE[visit.status]} label={SERVICE.status[visit.status]} />
        <Text variant="bodySm" tone="secondary">
          {SERVICE.kinds[visit.kind]}
        </Text>
      </View>
      {!visit.canWork ? (
        <Text variant="bodySm" tone="secondary">
          {visit.status === 'resolved' ? SERVICE.resolvedNote : SERVICE.readOnly}
        </Text>
      ) : null}
      <ProblemCard visit={visit} />
      <PlaceCard visit={visit} />
      <PromisesCard visit={visit} />
      <ServiceCheckInCard visit={visit} />
      <ServiceEvidence visit={visit} />
      {visit.canWork ? (
        <ReportForm draft={draft} errors={{ ...serverErrors, ...errors }} onChange={setDraft} />
      ) : null}
      <ReportHistory visit={visit} />
      {finish.error && !handingBack ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {describeError(finish.error)}
        </Text>
      ) : null}
      <HandBackSheet
        visit={visit}
        open={handingBack}
        pending={finish.isPending}
        error={handingBack ? finish.error : null}
        onClose={() => setHandingBack(false)}
        onSend={handBack}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
});
