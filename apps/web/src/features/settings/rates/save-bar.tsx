'use client';

import { Button } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';

/** The sticky save row under a Settings → Rates form. */
export function SaveBar({
  error,
  pending,
}: {
  readonly error: string | null;
  readonly pending: boolean;
}) {
  const t = useTranslations('costing.common');
  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl bg-raised/90 p-4 shadow-e3 ring-1 ring-hairline backdrop-blur sm:flex-row sm:items-center sm:justify-end">
      <FormError message={error} />
      <Button type="submit" variant="primary" pending={pending}>
        {t('save')}
      </Button>
    </div>
  );
}
