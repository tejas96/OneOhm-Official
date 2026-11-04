'use client';

import type { WorkforcePolicyInput } from '@oneohm/api-contracts';
import { Button, Dialog, Field, Input } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { NumberInput } from '../number-input';

type Kind = WorkforcePolicyInput['leaveTypes'][number];

/** "Paternity leave" → "paternity_leave": the short name stored on every request. */
const keyFrom = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

/** Add or edit one kind of leave; the change is kept with the page's other edits until saved. */
export function LeaveKindDialog({
  open,
  kind,
  takenKeys,
  keyLocked,
  onSave,
  onClose,
}: {
  readonly open: boolean;
  /** null adds a new kind. */
  readonly kind: Kind | null;
  readonly takenKeys: readonly string[];
  /** True once the kind is saved: requests may already be stored with its short name. */
  readonly keyLocked: boolean;
  readonly onSave: (kind: Kind) => void;
  readonly onClose: () => void;
}) {
  const t = useTranslations('settings.workforce.leaveKinds.dialog');
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [days, setDays] = useState<number | null>(12);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(kind?.label ?? '');
    setKey(kind?.key ?? '');
    setKeyTouched(kind !== null);
    setDays(kind?.daysPerYear ?? 12);
    setChecked(false);
  }, [open, kind]);

  const shownKey = keyTouched ? key : keyFrom(label);
  const errors = {
    label: label.trim().length < 2 ? t('labelError') : null,
    key: !/^[a-z_]{2,30}$/.test(shownKey)
      ? t('keyError')
      : takenKeys.includes(shownKey)
        ? t('keyTaken')
        : null,
    days: days === null || days < 0 || days > 366 ? t('daysError') : null,
  };

  const done = () => {
    setChecked(true);
    if (errors.label || errors.key || errors.days || days === null) return;
    onSave({ key: shownKey, label: label.trim(), daysPerYear: days });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={kind ? t('editTitle', { name: kind.label }) : t('addTitle')}
      description={t('description')}
      size="sm"
      autoFocusField
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={done}>
            {kind ? t('update') : t('add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <Field label={t('label')} required error={checked ? errors.label : null}>
          <Input value={label} onChange={(event) => setLabel(event.target.value)} />
        </Field>
        <Field
          label={t('key')}
          hint={keyLocked ? t('keyFixed') : t('keyHint')}
          error={checked ? errors.key : null}
        >
          <Input
            value={shownKey}
            readOnly={keyLocked}
            className="font-mono"
            onChange={(event) => {
              setKeyTouched(true);
              setKey(event.target.value);
            }}
          />
        </Field>
        <Field
          label={t('days')}
          hint={t('daysHint')}
          error={checked ? errors.days : null}
          className="max-w-xs"
        >
          <NumberInput unit="whole" value={days} onValueChange={setDays} />
        </Field>
      </div>
    </Dialog>
  );
}
