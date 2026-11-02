import type { ProjectTask } from '@oneohm/api-contracts';
import { siteVisitKindOf } from '@oneohm/domain';
import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Sheet,
  Text,
  useTheme,
} from '@oneohm/mobile-ui';
import { useState } from 'react';
import { COMMON } from '@/copy/common';
import { TASK } from '@/copy/tasks';
import { DayChips } from '@/features/leave/day-chips';
import { businessToday } from '@/lib/dates';

/** Six weeks of days to pick from, starting today. */
const DAYS_SHOWN = 42;

/**
 * A manager moves the due date with a reason (PRD 3.6). For the site survey the customer
 * is told the date; tasks waiting on this one move later when they must.
 */
export function RescheduleSheet({
  task,
  open,
  pending,
  error,
  onClose,
  onSave,
}: {
  readonly task: ProjectTask;
  readonly open: boolean;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onClose: () => void;
  readonly onSave: (input: { dueDate: string; reason: string }) => void;
}) {
  const words = TASK.rescheduleSheet;
  const theme = useTheme();
  const survey = siteVisitKindOf(task) === 'survey';
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const errors = fieldErrorsOf(error);
  const general = error ? describeError(error) : undefined;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={survey ? words.surveyTitle : words.title}
      description={survey ? words.surveyDescription : words.description}
      closeLabel={COMMON.close}
      footer={
        <Button
          label={words.save}
          size="lg"
          pending={pending}
          disabled={!dueDate || reason.trim().length < 3}
          onPress={() => {
            if (!pending && dueDate) onSave({ dueDate, reason });
          }}
          fullWidth
        />
      }
    >
      <DayChips
        label={words.date}
        start={businessToday()}
        count={DAYS_SHOWN}
        value={dueDate}
        onChange={setDueDate}
      />
      <Field label={words.reason} error={errors.reason ?? errors.dueDate}>
        <Input
          value={reason}
          onChangeText={setReason}
          placeholder={words.reasonPlaceholder}
          multiline
          maxLength={500}
          invalid={Boolean(errors.reason ?? errors.dueDate)}
          accessibilityLabel={words.reason}
        />
      </Field>
      {general ? (
        <Text variant="bodySm" color={theme.status.overdue.fg} accessibilityRole="alert">
          {general}
        </Text>
      ) : null}
    </Sheet>
  );
}
