import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Says plainly that day-one values are placeholders to be replaced with OneOhm's own. */
export function StarterNotice({ children }: { readonly children: string }) {
  const t = useTranslations('settings.starter');
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-2xl border border-at-risk/30 bg-at-risk-tint px-5 py-4"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-at-risk" />
      <div className="flex flex-col gap-1">
        <p className="type-title-md text-ink">{t('title')}</p>
        <p className="type-body-sm text-ink-muted">{children}</p>
      </div>
    </div>
  );
}
