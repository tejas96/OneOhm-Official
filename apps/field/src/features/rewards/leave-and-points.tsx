import type { MyWorkday } from '@oneohm/api-contracts';
import { StyleSheet, View } from 'react-native';
import { LeaveBalanceCard } from '@/features/leave/leave-balance-card';
import { useCan } from '@/session/session-provider';
import { RewardsCard } from './rewards-card';

/** Leave left and points earned side by side on Today (PRD 4.1). */
export function LeaveAndPoints({ workday }: { readonly workday: MyWorkday }) {
  const takesLeave = useCan('leave.request');
  return (
    <View style={styles.row}>
      {takesLeave ? <LeaveBalanceCard workday={workday} /> : null}
      <RewardsCard workday={workday} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
});
