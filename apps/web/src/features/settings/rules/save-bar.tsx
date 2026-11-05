'use client';

import { Button } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';

/** Save and discard under a rules form, with a quiet note while changes are unsaved. */
export function SaveBar({
  dirty,
  pending,
  error,
  blocked = false,
  onDiscard,
}: {
  readonly dirty: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  /** A box has a mistake: Save waits until it is fixed. */
  readonly blocked?: boolean;
  readonly onDiscard: () => void;
}) {
  const t = useTranslations('settings');
  return (
    <div className="flex flex-col gap-3 border-t border-hairline pt-6 sm:flex-row sm:items-center sm:justify-end">
      <FormError message={error} />
      {dirty && <p className="type-body-sm text-ink-faint sm:mr-auto">{t('rules.unsaved')}</p>}
      {dirty && (
        <Button variant="quiet" onClick={onDiscard}>
          {t('rules.discard')}
        </Button>
      )}
      <Button type="submit" variant="primary" pending={pending} disabled={!dirty || blocked}>
        {t('save')}
      </Button>
    </div>
  );
}
