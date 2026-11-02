import type { CustodyHolding, CustodyProject } from '@oneohm/api-contracts';
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
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { CREW } from '@/copy/crew';
import { businessToday } from '@/lib/dates';
import { CREW_KEYS, formatQuantity } from './use-crew';

const keyOf = (holding: CustodyHolding) => `${holding.productId}|${holding.lineKey ?? ''}`;

/** The problem with one typed quantity, or null when it is fine (or left empty). */
function problemWith(holding: CustodyHolding, raw: string): string | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return CREW.use.nothing;
  if (holding.serialised && !Number.isInteger(value)) return CREW.use.wholeUnits;
  if (value - holding.balance > 0.0005) return CREW.use.tooMuch;
  return null;
}

/** The crew says how much of what it holds went into the system on one project. */
export function UseSheet({
  project,
  taskId,
  onClose,
}: {
  readonly project: CustodyProject | null;
  readonly taskId?: string | undefined;
  readonly onClose: () => void;
}) {
  const theme = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const holdings = (project?.holdings ?? [])
    .filter((holding) => holding.balance > 0.0005)
    .sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!project) return;
    setAmounts({});
    setNote('');
    setError(null);
  }, [project]);

  const lines = holdings.flatMap((holding) => {
    const value = Number((amounts[keyOf(holding)] ?? '').trim().replace(',', '.'));
    return value > 0 ? [{ holding, quantity: value }] : [];
  });
  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.inventory.custody.crewUse({
          body: {
            projectId: project?.project.id ?? '',
            occurredOn: businessToday(),
            taskId: taskId ?? null,
            note: note.trim(),
            lines: lines.map(({ holding, quantity }) => ({
              productId: holding.productId,
              lineKey: holding.lineKey,
              quantity,
            })),
          },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: CREW_KEYS.material });
      toast(CREW.use.saved);
      onClose();
    },
    // The sentence names the field; the note's own message also shows under it.
    onError: (failure) => setError(describeError(failure)),
  });
  const noteError = fieldErrorsOf(save.error).note;
  const invalid = holdings.some((holding) => problemWith(holding, amounts[keyOf(holding)] ?? ''));

  return (
    <Sheet
      open={project !== null}
      onClose={onClose}
      title={CREW.use.title}
      description={project ? CREW.use.description(project.project.code) : undefined}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={CREW.use.save}
          size="lg"
          fullWidth
          pending={save.isPending}
          disabled={invalid}
          onPress={() => {
            if (lines.length === 0) {
              setError(CREW.use.nothing);
              return;
            }
            setError(null);
            if (!save.isPending) save.mutate();
          }}
        />
      }
    >
      {holdings.map((holding) => {
        const key = keyOf(holding);
        const problem = problemWith(holding, amounts[key] ?? '');
        return (
          <Field
            key={key}
            label={holding.name}
            hint={CREW.use.max(formatQuantity(holding.balance), holding.unit)}
            error={problem ?? undefined}
          >
            <Input
              value={amounts[key] ?? ''}
              onChangeText={(text) => setAmounts((current) => ({ ...current, [key]: text }))}
              keyboardType={holding.serialised ? 'number-pad' : 'decimal-pad'}
              placeholder="0"
              mono
              invalid={problem !== null}
              accessibilityLabel={`${holding.name} ${CREW.use.quantity(holding.unit)}`}
            />
          </Field>
        );
      })}
      <Field label={CREW.use.note} optional={COMMON.optional} error={noteError}>
        <Input
          value={note}
          onChangeText={setNote}
          placeholder={CREW.use.notePlaceholder}
          multiline
          maxLength={500}
          invalid={Boolean(noteError)}
          accessibilityLabel={CREW.use.note}
        />
      </Field>
      {error ? (
        <View
          style={[styles.alert, { backgroundColor: theme.status.overdue.tint }]}
          accessibilityRole="alert"
        >
          <Text variant="bodySm" color={theme.status.overdue.fg}>
            {error}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  alert: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
});
