import type { PayoutDetailsView } from '@oneohm/api-contracts';
import { Button, Card, Text } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PAYOUT } from '@/copy/reseller';
import { useCurrentUser } from '@/session/session-provider';
import { usePayoutDetails } from '../reseller/use-reseller';
import { PayoutDetailsSheet } from './payout-details-sheet';

/** The saved way to pay, as label and value rows (account number and PAN already masked). */
function savedRows(details: PayoutDetailsView): { label: string; value: string }[] {
  const rows = details.upiId
    ? [{ label: PAYOUT.upiId, value: details.upiId }]
    : [
        { label: PAYOUT.bankAccountName, value: details.bankAccountName ?? '' },
        { label: PAYOUT.bankAccountNumber, value: details.bankAccountNumber ?? '' },
        { label: PAYOUT.bankIfsc, value: details.bankIfsc ?? '' },
      ];
  return [...rows, { label: PAYOUT.pan, value: details.pan ?? '' }];
}

/**
 * A reseller's payout details on their profile: masked once saved, with Change; one Add
 * button until then.
 */
export function PayoutDetailsCard() {
  const user = useCurrentUser();
  const query = usePayoutDetails(user.id);
  const [open, setOpen] = useState(false);
  const details = query.data ?? null;
  // Never offer an empty form over details that failed to load.
  if (query.isPending || query.isError) return null;
  const complete = details?.complete === true;
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="overline" tone="tertiary">
          {PAYOUT.title.toUpperCase()}
        </Text>
        {complete ? (
          <Button label={PAYOUT.change} variant="quiet" size="sm" onPress={() => setOpen(true)} />
        ) : null}
      </View>
      {complete && details ? (
        savedRows(details).map((row) => (
          <View key={row.label} style={styles.row}>
            <Text variant="label" tone="tertiary">
              {row.label}
            </Text>
            <Text variant="body" numberOfLines={1}>
              {row.value}
            </Text>
          </View>
        ))
      ) : (
        <>
          <Text variant="body" tone="secondary">
            {PAYOUT.empty}
          </Text>
          <Button label={PAYOUT.add} onPress={() => setOpen(true)} fullWidth />
        </>
      )}
      <PayoutDetailsSheet open={open} saved={details} onClose={() => setOpen(false)} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 36,
  },
  row: { gap: 2 },
});
