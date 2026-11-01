import type { CustomerReferralProgram } from '@oneohm/api-contracts';
import { Button, Card, formatInr, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Share2 } from 'lucide-react-native';
import { Linking, Share, StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { useToast } from '@/components/toast';
import { REFER } from '@/copy/care';
import { useBrand } from '@/features/home/use-home';

export const referralProgramKey = ['customer', 'referral-program'] as const;

function terms(program: CustomerReferralProgram): string {
  if (!program.active) return REFER.termsOff;
  const amount = formatInr(program.amountPaise);
  return program.basis === 'per_kw'
    ? REFER.termsPerKw(amount, program.qualifyingEvent)
    : REFER.terms(amount, program.qualifyingEvent);
}

/** The message a friend gets: the code, and a WhatsApp link to the company with it typed in. */
function shareText(program: CustomerReferralProgram, company: string): string {
  const link = program.whatsappNumber
    ? `https://wa.me/${program.whatsappNumber}?text=${encodeURIComponent(REFER.friendMessage(program.code, company))}`
    : null;
  return REFER.shareText(program.code, link, company);
}

function Totals({ program }: { readonly program: CustomerReferralProgram }) {
  const items = (['earned', 'pending', 'approved', 'paid'] as const).map((key) => ({
    key,
    paise: program.totals[`${key}Paise`],
  }));
  if (program.totals.earnedPaise === 0) return null;
  return (
    <View style={styles.totals}>
      {items.map((item) => (
        <View key={item.key} style={styles.total}>
          <Text variant="label" tone="tertiary">
            {REFER.totals[item.key]}
          </Text>
          <Text variant="titleMd">{formatInr(item.paise)}</Text>
        </View>
      ))}
    </View>
  );
}

/** The customer's own code, the reward terms, totals so far and sharing (PRD 5.6). */
export function ReferralCodeCard() {
  const theme = useTheme();
  const toast = useToast();
  const query = useQuery({
    queryKey: referralProgramKey,
    queryFn: () => unwrap(api.customerReferrals.referralProgram()),
  });
  const brand = useBrand();
  const program = query.data;
  // The message names the company, so it waits for the profile as well as the program.
  if (!program || !brand) return null;
  const text = shareText(program, brand);
  const onWhatsApp = () =>
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() =>
      toast(REFER.shareFailed),
    );
  const elsewhere = async () => {
    try {
      await Share.share({ message: text });
    } catch {
      toast(REFER.shareFailed);
    }
  };
  return (
    <Card style={styles.card}>
      <Text variant="overline" tone="tertiary">
        {REFER.codeTitle.toUpperCase()}
      </Text>
      <Text
        variant="displayMd"
        style={styles.code}
        accessibilityLabel={REFER.codeLabel(program.code.split('').join(' '))}
        selectable
      >
        {program.code}
      </Text>
      <Text variant="bodySm" tone="secondary">
        {terms(program)}
      </Text>
      <Text variant="label" tone="tertiary">
        {program.active ? REFER.approvalNote : REFER.codeHint}
      </Text>
      <Totals program={program} />
      <View style={styles.actions}>
        <Button
          label={REFER.shareWhatsApp}
          icon={<MessageCircle size={18} color={theme.colors.onAccent} />}
          onPress={() => void onWhatsApp()}
          fullWidth
        />
        <Button
          label={REFER.shareOther}
          variant="secondary"
          icon={<Share2 size={18} color={theme.colors.textPrimary} />}
          onPress={() => void elsewhere()}
          fullWidth
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8, paddingVertical: 18 },
  code: { letterSpacing: 3 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 4 },
  total: { flexBasis: '45%', flexGrow: 1, gap: 2 },
  actions: { gap: 8, paddingTop: 6 },
});
