import type { CustomerProject } from '@oneohm/api-contracts';
import { Button, formatInr, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react-native';
import { Linking, StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { PAYMENTS } from '@/copy/money';

type Line = CustomerProject['payments']['milestones'][number];

/** Whether this line shows a Pay button: the customer's own share, due, payable online. */
export const canPayNow = (line: Line): boolean =>
  line.payer === 'customer' && (Boolean(line.payUrl) || Boolean(line.canPayOnline && line.id));

/**
 * Opens the Razorpay page for what is still owed (PRD 5.3). When the team has not sent a
 * link, OneOhm makes one now (or reuses the open one) and opens it straight away.
 */
export function PayNow({ line }: { readonly line: Line }) {
  const theme = useTheme();
  const open = usePayNow(line);
  return (
    <View style={styles.pay}>
      <Button
        label={PAYMENTS.payNow(formatInr(line.amountPaise - line.paidPaise))}
        icon={<CreditCard size={18} color={theme.colors.onAccent} />}
        pending={open.isPending}
        onPress={() => open.mutate()}
        fullWidth
      />
      <Text variant="label" tone="tertiary">
        {PAYMENTS.payHint}
      </Text>
      <FormAlert message={open.isError ? PAYMENTS.payFailed : null} />
    </View>
  );
}

/** Opens the pay page: the link already sent, or one OneOhm makes now. */
export function usePayNow(line: Line) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (line.payUrl) return line.payUrl;
      if (!line.id) throw new Error(PAYMENTS.payFailed);
      const link = await unwrap(api.customerPay.payMilestone({ params: { id: line.id } }));
      return link.url;
    },
    onSuccess: async (url) => {
      await Linking.openURL(url);
      void client.invalidateQueries({ queryKey: keys.home });
    },
  });
}

const styles = StyleSheet.create({ pay: { gap: 6, paddingTop: 4 } });
