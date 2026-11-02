'use client';

import { cn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { SkyArt, useSky } from './sky-art';

/**
 * Phones: a calm sky above the rooftop drawing. The sun sits where it is over the
 * business right now and rises into place; after sunset a moon and a few stars
 * take over. A short greeting matches the hour.
 */
export function SunriseScene({ className }: { readonly className?: string }) {
  const t = useTranslations('signIn.sky');
  const { phase } = useSky();
  const night = phase === 'night';
  return (
    <section
      aria-label={t('label')}
      className={cn(
        'relative isolate flex flex-col overflow-hidden px-6 pt-5 pb-8',
        night
          ? 'oh-ocean bg-[linear-gradient(180deg,var(--oh-panel-deep)_0%,var(--oh-panel)_70%,var(--oh-canvas)_100%)]'
          : 'bg-[linear-gradient(180deg,var(--color-accent-soft)_0%,var(--color-energy-soft)_62%,var(--color-canvas)_100%)]',
        className,
      )}
    >
      <header className="flex flex-col gap-3">
        {/* biome-ignore lint/performance/noImgElement: a static brand asset, already sized. */}
        <img
          src={night ? '/brand/oneohm-logo-white.webp' : '/brand/oneohm-logo.webp'}
          alt={t('logoAlt')}
          width={1200}
          height={390}
          className="h-8 w-auto self-start"
        />
        <p className="flex flex-col gap-0.5">
          <span
            className={cn(
              'type-overline uppercase',
              night ? 'text-on-panel-muted' : 'text-ink-muted',
            )}
          >
            {t(`hello.${phase}`)}
          </span>
          <span
            className={cn(
              'text-[1.625rem] leading-8 tracking-[-0.01em] [font-family:var(--font-display)]',
              night ? 'text-on-panel' : 'text-ink',
            )}
          >
            {t(`line.${phase}`)}
          </span>
        </p>
      </header>

      <SkyArt className="-mx-6 mt-1 w-[calc(100%+3rem)]" />
    </section>
  );
}
