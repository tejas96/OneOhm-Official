'use client';

import { Field, Input, SegmentedControl } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import type { Draft } from './compose-checks';

/** A post goes out now, or on a day and time the person picks. */
export function WhenPicker({
  draft,
  onChange,
}: {
  readonly draft: Pick<Draft, 'when' | 'date' | 'time'>;
  readonly onChange: (change: Partial<Pick<Draft, 'when' | 'date' | 'time'>>) => void;
}) {
  const t = useTranslations('marketing');
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        label={t('when.label')}
        value={draft.when}
        onValueChange={(when) => onChange({ when })}
        options={[
          { value: 'now', label: t('when.now') },
          { value: 'later', label: t('when.later') },
        ]}
      />
      {draft.when === 'later' && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('when.date')}>
            <Input
              type="date"
              value={draft.date}
              onChange={(event) => onChange({ date: event.target.value })}
            />
          </Field>
          <Field label={t('when.time')}>
            <Input
              type="time"
              value={draft.time}
              onChange={(event) => onChange({ time: event.target.value })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
