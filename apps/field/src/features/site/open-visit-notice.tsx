import type { SiteVisit, TrackingStatus } from '@oneohm/api-contracts';
import { Button, describeError, Text } from '@oneohm/mobile-ui';
import { StyleSheet, View } from 'react-native';
import { useToast } from '@/components/toast';
import { SITE } from '@/copy/site';
import { openVisitTitle } from './open-visit';
import { useCloseOpenVisit } from './use-task-site';

/**
 * "You are still checked in for X", with a button that checks out of it by the visit's id
 * (live review S1). It works from any task or request screen, so it never leads to a
 * screen that refuses the person because the task was handed over or the request resolved.
 */
export function OpenVisitNotice({
  visit,
  tracking,
}: {
  readonly visit: SiteVisit;
  readonly tracking: TrackingStatus | undefined;
}) {
  const toast = useToast();
  const close = useCloseOpenVisit();
  const title = openVisitTitle(visit);
  return (
    <View style={styles.box}>
      <Text variant="bodySm" tone="secondary">
        {SITE.elsewhere(title)}
      </Text>
      <Button
        label={SITE.checkOutElsewhere(title)}
        variant="secondary"
        pending={close.isPending}
        onPress={() => {
          if (close.isPending) return;
          close.mutate(
            { visitId: visit.id, tracking },
            {
              onSuccess: () => toast(SITE.checkedOut),
              onError: (error) => toast(describeError(error)),
            },
          );
        }}
        fullWidth
      />
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: 8 } });
