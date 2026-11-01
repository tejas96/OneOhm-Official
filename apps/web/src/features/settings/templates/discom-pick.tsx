'use client';

import type { Discom } from '@oneohm/api-contracts';
import { Checkbox, Field } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useDiscoms } from '../use-settings';

interface Choice {
  readonly code: string;
  readonly name: string;
  /** Quiet second line: the code, and why an old pick still shows. */
  readonly detail: string;
}

/**
 * DISCOMs in use, plus any picked earlier that are now switched off or no longer listed,
 * so saving never drops a code nobody can see.
 */
function choicesFrom(
  discoms: readonly Discom[],
  picked: readonly string[],
  notes: { readonly inactive: (code: string) => string; readonly unlisted: string },
): Choice[] {
  const shown = discoms
    .filter((discom) => discom.active || picked.includes(discom.code))
    .map((discom) => ({
      code: discom.code,
      name: discom.name,
      detail: discom.active ? discom.code : notes.inactive(discom.code),
    }));
  const unlisted = picked
    .filter((code) => !discoms.some((discom) => discom.code === code))
    .map((code) => ({ code, name: code, detail: notes.unlisted }));
  return [...shown, ...unlisted];
}

/** Pick DISCOMs by name; none picked means every DISCOM. Stores their codes. */
export function DiscomPick({
  value,
  onChange,
  error,
}: {
  readonly value: readonly string[];
  readonly onChange: (codes: string[]) => void;
  readonly error?: string | undefined;
}) {
  const t = useTranslations('settings.taskTemplates.sheet');
  const discoms = useDiscoms();
  const choices = choicesFrom(discoms.data ?? [], value, {
    inactive: (code) => t('discomInactive', { code }),
    unlisted: t('discomUnlisted'),
  });
  const toggle = (code: string, on: boolean) =>
    onChange(on ? [...value, code] : value.filter((item) => item !== code));
  return (
    <Field label={t('discoms')} hint={t('discomsHint')} error={error}>
      {discoms.isPending && <p className="type-body-sm text-ink-faint">{t('discomsLoading')}</p>}
      {!discoms.isPending && choices.length === 0 && (
        <p className="type-body-sm text-ink-faint">{t('discomsNone')}</p>
      )}
      <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
        {choices.map((choice) => (
          <Checkbox
            key={choice.code}
            checked={value.includes(choice.code)}
            label={choice.name}
            description={choice.detail}
            onCheckedChange={(on) => toggle(choice.code, on)}
          />
        ))}
      </div>
    </Field>
  );
}
