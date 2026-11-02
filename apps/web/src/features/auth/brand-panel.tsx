import { cn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { SkyArt } from './sky-art';

const LEGEND = ['array', 'inverter', 'meter', 'grid'] as const;
const LETTERS = { array: 'A', inverter: 'B', meter: 'C', grid: 'D' } as const;

/** The left half of sign-in: solar glass, the single-line drawing and what OneOhm is for. */
export function BrandPanel({ className }: { readonly className?: string }) {
  const t = useTranslations('signIn.panel');
  return (
    <section
      aria-label={t('label')}
      className={cn(
        'oh-panel oh-ocean flex min-h-[22rem] flex-col justify-between gap-8 p-6 sm:p-10 lg:min-h-dvh lg:p-12',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-6">
        {/* biome-ignore lint/performance/noImgElement: a static brand asset, already sized. */}
        <img
          src="/brand/oneohm-logo-white.webp"
          alt={t('logoAlt')}
          width={1200}
          height={390}
          className="h-11 w-auto sm:h-12"
        />
        <p className="hidden font-mono text-[0.75rem] text-on-panel-muted sm:block">{t('sheet')}</p>
      </header>

      <SkyArt onPanel className="mx-auto hidden w-full max-w-[34rem] md:block" />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="type-display-lg text-on-panel md:type-display-xl">
            {t('headlineOne')}
            <br />
            <span className="italic text-on-panel-muted">{t('headlineTwo')}</span>
          </h1>
          <p className="max-w-md type-body text-on-panel-muted">{t('description')}</p>
        </div>
        <dl className="hidden grid-cols-4 overflow-hidden rounded-lg border border-on-panel/15 bg-panel-deep/30 backdrop-blur-sm sm:grid">
          {LEGEND.map((key) => (
            <div
              key={key}
              className="flex flex-col gap-1 border-on-panel/15 px-4 py-3 not-last:border-r"
            >
              <dt className="font-mono text-[0.6875rem] tracking-wide text-on-panel-muted uppercase">
                {LETTERS[key]} · {t(`legend.${key}.verb`)}
              </dt>
              <dd className="type-body-sm text-on-panel">{t(`legend.${key}.name`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
