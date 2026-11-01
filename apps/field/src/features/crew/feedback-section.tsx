import type { CrewFeedback } from '@oneohm/api-contracts';
import {
  Card,
  describeError,
  ErrorState,
  formatInr,
  LoadingState,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { Star } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SectionTitle } from '@/components/screen-header';
import { COMMON } from '@/copy/common';
import { CREW } from '@/copy/crew';
import { shortMoment } from '@/lib/dates';
import { useCrewFeedback } from './use-crew';

/** On-time share, customer ratings and rework on the crew's jobs. */
export function FeedbackSection() {
  const query = useCrewFeedback();
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
  const data = query.data;
  return (
    <View style={styles.section}>
      <Figures data={data} />
      <SectionTitle title={CREW.feedback.ratingsTitle} count={data.ratings.length} />
      {data.ratings.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {CREW.feedback.noRatings}
        </Text>
      ) : (
        data.ratings.map((rating) => (
          <Card key={`${rating.projectCode}-${rating.createdAt}`} style={styles.row}>
            <View style={styles.grow}>
              <Text variant="mono" tone="tertiary">
                {rating.projectCode} · {shortMoment(rating.createdAt)}
              </Text>
              <Text variant="body" numberOfLines={1}>
                {rating.projectName}
              </Text>
            </View>
            <Stars rating={rating.rating} />
          </Card>
        ))
      )}
      <SectionTitle title={CREW.feedback.reworkTitle} count={data.rework.length} />
      {data.rework.length === 0 ? (
        <Text variant="bodySm" tone="secondary">
          {CREW.feedback.noRework}
        </Text>
      ) : (
        data.rework.map((item) => (
          <Card key={item.id} style={styles.rework}>
            <Text variant="mono" tone="tertiary">
              {item.workOrderNumber} · {item.projectCode} · {shortMoment(item.createdAt)}
            </Text>
            {item.taskTitle ? <Text variant="titleMd">{item.taskTitle}</Text> : null}
            <Text variant="body" tone="secondary">
              {item.note}
            </Text>
            {item.deductionPaise > 0 ? (
              <Text variant="label" tone="secondary">
                {CREW.feedback.deduction(formatInr(item.deductionPaise))}
              </Text>
            ) : null}
          </Card>
        ))
      )}
    </View>
  );
}

function Figures({ data }: { readonly data: CrewFeedback }) {
  const items = [
    {
      key: 'onTime',
      label: CREW.feedback.onTime,
      value: data.onTimePercent === null ? CREW.feedback.none : `${data.onTimePercent}%`,
    },
    { key: 'completed', label: CREW.feedback.completed, value: String(data.completedWorkOrders) },
    {
      key: 'rating',
      label: CREW.feedback.rating,
      value:
        data.averageRating === null
          ? CREW.feedback.none
          : CREW.feedback.ratingValue(data.averageRating.toFixed(1)),
    },
  ];
  return (
    <Card style={styles.figures}>
      {items.map((item) => (
        <View key={item.key} style={styles.figure}>
          <Text variant="displayMd">{item.value}</Text>
          <Text variant="label" tone="tertiary">
            {item.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function Stars({ rating }: { readonly rating: number }) {
  const theme = useTheme();
  return (
    <View style={styles.stars} accessibilityLabel={CREW.feedback.ratingAria(rating)}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          color={value <= rating ? theme.colors.energy : theme.colors.borderStrong}
          fill={value <= rating ? theme.colors.energy : 'transparent'}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  figures: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  figure: { gap: 2, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  grow: { flex: 1, gap: 2 },
  stars: { flexDirection: 'row', gap: 2 },
  rework: { gap: 4, paddingVertical: 14 },
});
