import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { Button, Card, describeError, Text, unwrap, useTheme } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, FileUp, ImageIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { SectionTitle } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { DOCUMENTS } from '@/copy/money';
import { lookup } from '@/i18n/copy';
import { momentDate } from '@/lib/dates';
import { type FileSource, pickRequestedFile, sendRequestedFile } from './requested-files';

export const requestsKey = ['customer', 'document-requests'] as const;

/** Papers OneOhm asked for (PRD 5.4): send each as a photo or a PDF. */
export function RequestedSection() {
  const query = useQuery({
    queryKey: requestsKey,
    queryFn: () => unwrap(api.customerDocumentRequests.listMyDocumentRequests()),
  });
  const open = (query.data ?? []).filter((request) => request.status === 'open');
  if (open.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionTitle title={DOCUMENTS.requestsTitle.toUpperCase()} count={open.length} />
      <Text variant="body" tone="secondary">
        {DOCUMENTS.requestsIntro}
      </Text>
      {open.map((request) => (
        <RequestCard key={request.id} request={request} />
      ))}
    </View>
  );
}

function RequestCard({ request }: { readonly request: CustomerDocumentRequest }) {
  const theme = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: async (source: FileSource) => {
      const picked = await pickRequestedFile(source);
      if (picked === 'denied') {
        throw new Error(source === 'camera' ? DOCUMENTS.cameraDenied : DOCUMENTS.libraryDenied);
      }
      if (!picked) return null;
      return sendRequestedFile(request.id, picked);
    },
    onMutate: () => setError(null),
    onSuccess: async (sent) => {
      if (!sent) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: requestsKey }),
        client.invalidateQueries({ queryKey: keys.documents }),
      ]);
      toast(DOCUMENTS.sent(sent.title));
    },
    onError: (failure) =>
      setError(
        failure instanceof Error && failure.message ? describeError(failure) : DOCUMENTS.sendFailed,
      ),
  });
  const kind = lookup(DOCUMENTS.category, request.category) ?? DOCUMENTS.category.other;
  const busy = send.isPending;
  return (
    <Card style={styles.card}>
      <View style={styles.text}>
        <Text variant="titleMd">{request.title}</Text>
        <Text variant="label" tone="tertiary">
          {DOCUMENTS.requestMeta(
            request.homeName ?? request.projectCode,
            `${kind} · ${momentDate(request.createdAt)}`,
          )}
        </Text>
        {request.note ? (
          <Text variant="body" tone="secondary">
            {request.note}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button
          size="sm"
          label={busy ? DOCUMENTS.sending : DOCUMENTS.takePhoto}
          icon={<Camera size={16} color={theme.colors.onAccent} />}
          pending={busy && send.variables === 'camera'}
          disabled={busy}
          onPress={() => send.mutate('camera')}
        />
        <Button
          size="sm"
          variant="secondary"
          label={DOCUMENTS.choosePhoto}
          icon={<ImageIcon size={16} color={theme.colors.textPrimary} />}
          pending={busy && send.variables === 'library'}
          disabled={busy}
          onPress={() => send.mutate('library')}
        />
        <Button
          size="sm"
          variant="secondary"
          label={DOCUMENTS.chooseFile}
          icon={<FileUp size={16} color={theme.colors.textPrimary} />}
          pending={busy && send.variables === 'file'}
          disabled={busy}
          onPress={() => send.mutate('file')}
        />
      </View>
      <FormAlert message={error} />
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  card: { gap: 12 },
  text: { gap: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
