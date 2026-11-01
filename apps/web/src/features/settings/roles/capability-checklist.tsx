'use client';

import { Checkbox } from '@oneohm/design-system/web';
import { CAPABILITIES, type Capability } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { CAPABILITY_GROUPS } from './capability-areas';

/** Permissions grouped by area, each area with a one-tap all / none. */
export function CapabilityChecklist({
  value,
  onChange,
  disabled = false,
}: {
  readonly value: readonly Capability[];
  readonly onChange: (next: Capability[]) => void;
  readonly disabled?: boolean;
}) {
  const t = useTranslations('settings');
  const editorT = useTranslations('settings.roles.editor');
  const set = (capabilities: readonly Capability[], on: boolean) => {
    const rest = value.filter((capability) => !capabilities.includes(capability));
    onChange(on ? [...rest, ...capabilities] : rest);
  };
  return (
    <fieldset className="flex flex-col gap-6" disabled={disabled}>
      <legend className="flex w-full items-baseline justify-between gap-3">
        <span className="type-title-md text-ink">{editorT('permissions')}</span>
        <span className="type-body-sm text-ink-faint tabular-nums">
          {editorT('selected', { count: value.length, total: CAPABILITIES.length })}
        </span>
      </legend>
      {CAPABILITY_GROUPS.map((group) => {
        const held = group.capabilities.filter((capability) => value.includes(capability));
        const all = held.length === group.capabilities.length;
        return (
          <div key={group.area} className="flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-hairline pb-2">
              <p className="type-overline text-ink-faint uppercase">
                {t(`areas.${group.area}`)}
                <span className="ml-2 font-mono normal-case tracking-normal">
                  {held.length}/{group.capabilities.length}
                </span>
              </p>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => set(group.capabilities, !all)}
                  className="type-body-sm font-medium text-accent hover:underline"
                >
                  {all ? editorT('clear') : editorT('selectAll')}
                </button>
              )}
            </div>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {group.capabilities.map((capability) => (
                <Checkbox
                  key={capability}
                  checked={value.includes(capability)}
                  disabled={disabled}
                  onCheckedChange={(checked) => set([capability], checked)}
                  label={t(`capabilities.${capability}`)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
