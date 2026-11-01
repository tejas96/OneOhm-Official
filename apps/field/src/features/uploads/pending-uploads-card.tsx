import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { type Href, router } from 'expo-router';
import { CloudUpload } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { UPLOADS } from '@/copy/uploads';
import { onItsWay, screenOf } from './queue-logic';
import { useUploadQueue } from './upload-queue';

/**
 * PRD 4.1 pending-uploads indicator on Today: how many files are still on this phone,
 * and which need the person (refused ones). Opens the task they belong to.
 */
export function PendingUploadsCard() {
  const theme = useTheme();
  const { items } = useUploadQueue();
  const refused = items.filter((item) => !onItsWay(item));
  const first = refused[0] ?? items[0];
  if (!first) return null;
  const tone = refused.length > 0 ? theme.status.atRisk : theme.status.waiting;
  return (
    <Card
      onPress={() => router.push(screenOf(first) as Href)}
      accessibilityLabel={`${UPLOADS.waiting(items.length)}. ${UPLOADS.openTask}`}
      style={styles.card}
    >
      <View style={[styles.icon, { backgroundColor: tone.tint }]}>
        <CloudUpload size={18} color={tone.fg} />
      </View>
      <View style={styles.flex}>
        <Text variant="titleMd">{UPLOADS.waiting(items.length)}</Text>
        <Text variant="bodySm" tone="secondary">
          {refused.length > 0 ? UPLOADS.needsYou(refused.length) : UPLOADS.body}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});
