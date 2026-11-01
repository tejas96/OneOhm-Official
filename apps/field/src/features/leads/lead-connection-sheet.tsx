import type { Discom, LeadDetail, SiteConnection } from '@oneohm/api-contracts';
import { defaultDiscomId } from '@oneohm/domain';
import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/api/api';
import { useToast } from '@/components/toast';
import { LEAD_CONNECTION } from '@/copy/capture';
import { COMMON } from '@/copy/common';
import { DiscomPicker } from '@/features/discom/discom-picker';
import { offeredDiscoms } from '@/features/discom/use-discoms';

export const leadConnectionKey = (leadId: string) =>
  ['site', 'connection', 'lead', leadId] as const;

/**
 * The consumer number and DISCOM of a lead's site, noted from the bill at the first
 * visit (PRD 4.5). With a single active DISCOM it starts picked, for the person to confirm.
 */
export function LeadConnectionSheet({
  lead,
  site,
  discoms,
  open,
  onClose,
}: {
  readonly lead: LeadDetail;
  readonly site: SiteConnection;
  readonly discoms: readonly Discom[];
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const client = useQueryClient();
  const toast = useToast();
  const [consumer, setConsumer] = useState(site.consumerNumber ?? '');
  const [discomId, setDiscomId] = useState(() => defaultDiscomId(discoms, site.discomId));
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.siteConnection.updateLeadConnection({
          params: { id: lead.id },
          body: { consumerNumber: consumer.trim() || null, discomId },
        }),
      ),
    onSuccess: (next) => {
      client.setQueryData(leadConnectionKey(lead.id), next);
      toast(LEAD_CONNECTION.saved);
      onClose();
    },
  });
  const errors = fieldErrorsOf(save.error);
  const general = save.error && Object.keys(errors).length === 0 ? describeError(save.error) : null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={LEAD_CONNECTION.sheetTitle}
      description={LEAD_CONNECTION.sheetDescription}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={LEAD_CONNECTION.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          onPress={() => save.mutate()}
        />
      }
    >
      <Field
        label={LEAD_CONNECTION.consumerNumber}
        hint={LEAD_CONNECTION.consumerHint}
        optional={COMMON.optional}
        error={errors.consumerNumber}
      >
        <Input
          value={consumer}
          onChangeText={setConsumer}
          autoCapitalize="characters"
          autoCorrect={false}
          invalid={Boolean(errors.consumerNumber)}
          accessibilityLabel={LEAD_CONNECTION.consumerNumber}
        />
      </Field>
      <DiscomPicker
        discoms={offeredDiscoms(discoms, site.discomId)}
        value={discomId}
        onChange={setDiscomId}
        optional={COMMON.optional}
        error={errors.discomId}
      />
      {general ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {general}
        </Text>
      ) : null}
    </Sheet>
  );
}
