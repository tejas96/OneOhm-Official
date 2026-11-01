import { WAITING_PARTIES, type WaitingParty } from '@oneohm/domain';
import { Button, ChoiceChips, Field, Sheet } from '@oneohm/mobile-ui';
import { useState } from 'react';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { DictationInput } from '@/features/dictation/dictation-input';

/** Who the task is waiting on, and why; DISCOM and bank time is reported separately. */
export function WaitingSheet({
  open,
  pending,
  initialParty,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly pending: boolean;
  readonly initialParty: WaitingParty;
  readonly onClose: () => void;
  readonly onSave: (party: WaitingParty, note: string) => void;
}) {
  const [party, setParty] = useState<WaitingParty>(
    initialParty === 'internal' ? 'customer' : initialParty,
  );
  const [note, setNote] = useState('');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={TASK.waitingSheet.title}
      description={TASK.waitingSheet.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={TASK.waitingSheet.save}
          size="lg"
          pending={pending}
          onPress={() => onSave(party, note)}
          fullWidth
        />
      }
    >
      <Field
        label={TASK.waitingSheet.party}
        hint={party === 'internal' ? TASK.waitingSheet.helpNote : undefined}
      >
        <ChoiceChips
          label={TASK.waitingSheet.party}
          choices={WAITING_PARTIES.map((value) => ({ value, label: COMMON.parties[value] }))}
          value={party}
          onChange={setParty}
        />
      </Field>
      <Field label={TASK.waitingSheet.note} optional={COMMON.optional}>
        <DictationInput
          value={note}
          onChangeText={setNote}
          placeholder={TASK.waitingSheet.notePlaceholder}
          multiline
          accessibilityLabel={TASK.waitingSheet.note}
        />
      </Field>
    </Sheet>
  );
}
