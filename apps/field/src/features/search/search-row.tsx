import type { SearchHit } from '@oneohm/api-contracts';
import { Card, Text, useTheme } from '@oneohm/mobile-ui';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { LEADS } from '@/copy/sales';
import { SEARCH } from '@/copy/search';
import { TASK } from '@/copy/tasks';
import { detailLine } from './search-groups';

/** The words for a hit's state: a lead's stage, a task's status, a project that is not active. */
export function stateWords(hit: SearchHit): string | null {
  const state = hit.state;
  if (!state) return null;
  if (hit.type === 'leads') return LEADS.stage[state as keyof typeof LEADS.stage] ?? null;
  if (hit.type === 'tasks') return TASK.status[state as keyof typeof TASK.status] ?? null;
  if (hit.type === 'projects' && state !== 'active') return SEARCH.projectStatus[state] ?? null;
  return null;
}

/** One found record: its name and a short line of facts; opens it on a tap. */
export function SearchRow({
  hit,
  onOpen,
}: {
  readonly hit: SearchHit;
  readonly onOpen: (hit: SearchHit) => void;
}) {
  const theme = useTheme();
  const detail = detailLine(hit, stateWords(hit));
  return (
    <Card onPress={() => onOpen(hit)} accessibilityLabel={hit.title} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="titleMd" numberOfLines={1}>
            {hit.title}
          </Text>
          {detail ? (
            <Text variant="bodySm" tone="secondary" numberOfLines={1}>
              {detail}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={18} color={theme.colors.textTertiary} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1, gap: 2 },
});
