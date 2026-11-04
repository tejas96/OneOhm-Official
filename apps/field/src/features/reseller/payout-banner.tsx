import { PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { ChevronRight, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { EARNINGS } from '@/copy/reseller';
import { PayoutDetailsSheet } from '@/features/profile/payout-details-sheet';
import { useCurrentUser } from '@/session/session-provider';
import { usePayoutDetails } from './use-reseller';

/** Until a reseller's payout details are complete: one banner that opens the form. */
export function PayoutBanner() {
  const theme = useTheme();
  const user = useCurrentUser();
  const query = usePayoutDetails(user.id);
  const [open, setOpen] = useState(false);
  const tone = theme.status.atRisk;
  // Shown only once we know the details are incomplete, so it never flashes for a moment.
  if (!query.data || query.data.complete) return null;
  return (
    <>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={EARNINGS.payoutBanner}
        accessibilityHint={EARNINGS.payoutBannerHint}
        onPress={() => setOpen(true)}
        style={[styles.banner, { backgroundColor: tone.tint }]}
      >
        <Wallet size={20} color={tone.fg} />
        <Text variant="titleMd" color={tone.fg} style={styles.text}>
          {EARNINGS.payoutBanner}
        </Text>
        <ChevronRight size={18} color={tone.fg} />
      </PressableScale>
      <PayoutDetailsSheet open={open} saved={query.data} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
  },
  text: { flex: 1 },
});
