import { Button, Card, Text } from '@oneohm/mobile-ui';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { STAGE_RATING } from '@/copy/ratings';
import { useStageRatings } from './use-stage-ratings';

/** On Home: the first finished stage of this project the customer has not rated yet. */
export function RateStageCard({ projectId }: { readonly projectId: string }) {
  const query = useStageRatings();
  const next = (query.data ?? []).find((card) => card.projectId === projectId && !card.rating);
  if (!next) return null;
  const stage = STAGE_RATING.stage[next.stage] ?? next.stage;
  return (
    <Card style={styles.card}>
      <View style={styles.text}>
        <Text variant="titleMd">{STAGE_RATING.cardTitle(stage)}</Text>
        <Text variant="bodySm" tone="secondary">
          {STAGE_RATING.cardBody(next.projectCode)}
        </Text>
      </View>
      <Button
        size="sm"
        label={STAGE_RATING.cardAction}
        onPress={() =>
          router.push({
            pathname: '/feedback/stage',
            params: { projectId: next.projectId, stage: next.stage },
          })
        }
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 4 },
});
