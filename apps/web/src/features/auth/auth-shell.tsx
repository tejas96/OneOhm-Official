import type { ReactNode } from 'react';
import { BrandPanel } from './brand-panel';
import { SunriseScene } from './sunrise-scene';

/**
 * The sign-in screens' frame. Wide screens: the solar-glass drawing beside the card.
 * Phones: a sunrise sky, the card as a sheet over it.
 */
export function AuthShell({
  children,
  footer,
}: {
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BrandPanel className="hidden lg:flex" />
      <SunriseScene className="lg:hidden" />
      <div className="relative z-10 -mt-7 flex flex-col items-center justify-between gap-6 rounded-t-[28px] bg-canvas px-6 pt-4 pb-10 shadow-[0_-18px_40px_-24px_rgb(5_52_77/0.35)] sm:px-10 lg:mt-0 lg:gap-10 lg:rounded-none lg:py-10 lg:shadow-none">
        <span aria-hidden className="h-1 w-10 rounded-full bg-rule lg:invisible" />
        {children}
        {footer ? (
          <p className="max-w-sm text-center type-body-sm text-ink-faint">{footer}</p>
        ) : (
          <span aria-hidden />
        )}
      </div>
    </main>
  );
}
