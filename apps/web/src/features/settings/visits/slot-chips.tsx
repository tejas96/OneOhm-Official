'use client';

import { Button, cn, Field, IconButton, Input } from '@oneohm/design-system/web';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { sortedSlots } from '../working-time/working-time-draft';

/** The visit start times as chips: add a time, remove one; the list stays in clock order. */
export function SlotChips({
  starts,
  onChange,
  errors,
}: {
  readonly starts: readonly string[];
  readonly onChange: (starts: string[]) => void;
  readonly errors: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('settings.visits.slots');
  const [time, setTime] = useState('');
  const messages = Object.entries(errors)
    .filter(([field]) => field === 'slotStarts' || field.startsWith('slotStarts.'))
    .map(([, message]) => message);
  const add = () => {
    if (time === '') return;
    onChange(sortedSlots(starts, time));
    setTime('');
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="type-label text-ink-muted">{t('label')}</p>
      <ul className="flex flex-wrap gap-2">
        {starts.map((start, index) => (
          <li
            key={start}
            className={cn(
              'flex h-10 items-center gap-1 rounded-full border bg-raised pr-1 pl-4 font-mono tabular-nums type-body-sm',
              errors[`slotStarts.${index}`] ? 'border-overdue/50 text-overdue' : 'border-hairline',
            )}
          >
            {start}
            <IconButton
              size="sm"
              label={t('remove', { time: start })}
              onClick={() => onChange(starts.filter((other) => other !== start))}
            >
              <X />
            </IconButton>
          </li>
        ))}
      </ul>
      <div className="flex items-end gap-3">
        <Field label={t('add')} className="w-40">
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>
        <Button variant="secondary" onClick={add} disabled={time === ''}>
          {t('addButton')}
        </Button>
      </div>
      {messages.map((message) => (
        <p key={message} role="alert" className="type-body-sm text-overdue">
          {message}
        </p>
      ))}
    </div>
  );
}
