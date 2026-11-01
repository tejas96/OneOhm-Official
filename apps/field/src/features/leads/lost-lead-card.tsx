import type { LeadDetail } from '@oneohm/api-contracts';
import { Button, Card, describeError, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { api, keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { LOST_LEAD } from '@/copy/sales';
import { businessToday } from '@/lib/dates';
import { useCan } from '@/session/session-provider';

/**
 * Why a lead was lost and, for those who manage leads, bringing it back: it returns to
 * Contacted with a follow-up today, the same as reopening it on the web (PRD 3.3).
 */
export function LostLeadCard({ lead }: { readonly lead: LeadDetail }) {
  const theme = useTheme();
  const client = useQueryClient();
  const toast = useToast();
  const canManage = useCan('leads.manage');
  const reopen = useMutation({
    mutationFn: () =>
      unwrap(
        api.crm.updateLead({
          params: { id: lead.id },
          body: { stage: 'contacted', nextActionOn: businessToday() },
        }),
      ),
    onSuccess: async (next) => {
      client.setQueryData(['lead', lead.id], next);
      await client.invalidateQueries({ queryKey: keys.leads });
      toast(LOST_LEAD.reopened);
    },
  });
  const reason = lead.lostReasonKey ? LOST_LEAD.reasons[lead.lostReasonKey] : null;
  return (
    <Card style={styles.card}>
      <Text variant="label" tone="tertiary">
        {LOST_LEAD.title}
      </Text>
      {reason || lead.lostReason ? <Text variant="body">{reason ?? lead.lostReason}</Text> : null}
      {reason && lead.lostReason ? (
        <Text variant="bodySm" tone="secondary">
          {lead.lostReason}
        </Text>
      ) : null}
      {canManage ? (
        <>
          <Button
            label={LOST_LEAD.reopen}
            variant="secondary"
            pending={reopen.isPending}
            icon={<RotateCcw size={16} color={theme.colors.textPrimary} />}
            onPress={() => reopen.mutate()}
          />
          <Text variant="bodySm" tone="tertiary">
            {LOST_LEAD.reopenHint}
          </Text>
        </>
      ) : null}
      {reopen.error ? (
        <Text variant="bodySm" color={theme.status.overdue.fg}>
          {describeError(reopen.error)}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
});
