import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SettingsSection } from '../settings-section';

const LINES = ['where', 'app', 'noCash', 'fair'] as const;

/** Where points show and what they are for, true to how OneOhm uses them. */
export function PointsMeaning() {
  const t = useTranslations('settings.rewards.meaning');
  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <ul className="flex max-w-2xl flex-col gap-3">
        {LINES.map((line) => (
          <li key={line} className="border-l-2 border-hairline pl-3 type-body text-ink-muted">
            {t(line)}
          </li>
        ))}
      </ul>
      <Link
        href="/team?tab=points"
        className="inline-flex items-center gap-1 self-start type-body-sm text-accent hover:underline"
      >
        {t('open')}
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </SettingsSection>
  );
}
