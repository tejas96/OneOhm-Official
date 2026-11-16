'use client';

import { cn } from '@oneohm/design-system/web';
import { Map as MapIcon, Minus, Plus, Satellite, Scan, UsersRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCamera, useZoomKeys } from './map-camera';

/**
 * The map's controls in the same glass as the panes (Google's own UI is off): zoom in and out
 * (also + and − on the keyboard), Fit all, My team, and the satellite switch.
 */
export function MapControls({
  satellite,
  onSatellite,
  onFitAll,
  onMyTeam,
  padding,
  className,
}: {
  readonly satellite: boolean;
  readonly onSatellite: (satellite: boolean) => void;
  readonly onFitAll: () => void;
  /** Only the people on duty, without the sites; absent in a day view. */
  readonly onMyTeam?: (() => void) | undefined;
  readonly padding: google.maps.Padding;
  readonly className?: string;
}) {
  const t = useTranslations('liveMap.controls');
  const { zoomBy } = useCamera(padding);
  useZoomKeys(zoomBy);
  return (
    <div data-map-obstacle className={cn('pointer-events-auto flex flex-col gap-2', className)}>
      <Group>
        <Control label={t('zoomIn')} hint="+" onClick={() => zoomBy(1)}>
          <Plus />
        </Control>
        <span aria-hidden className="mx-2 h-px bg-hairline" />
        <Control label={t('zoomOut')} hint="−" onClick={() => zoomBy(-1)}>
          <Minus />
        </Control>
      </Group>
      <Group>
        <Control label={t('fitAll')} onClick={onFitAll}>
          <Scan />
        </Control>
        {onMyTeam && (
          <>
            <span aria-hidden className="mx-2 h-px bg-hairline" />
            <Control label={t('myTeam')} onClick={onMyTeam}>
              <UsersRound />
            </Control>
          </>
        )}
      </Group>
      <Group>
        <Control
          label={satellite ? t('roadmap') : t('satellite')}
          pressed={satellite}
          onClick={() => onSatellite(!satellite)}
        >
          {satellite ? <MapIcon /> : <Satellite />}
        </Control>
      </Group>
    </div>
  );
}

function Group({ children }: { readonly children: ReactNode }) {
  return <div className="live-glass flex flex-col overflow-hidden rounded-xl">{children}</div>;
}

function Control({
  label,
  hint,
  onClick,
  pressed,
  children,
}: {
  readonly label: string;
  /** The key that does the same, in the tooltip. */
  readonly hint?: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      aria-keyshortcuts={hint === '−' ? '-' : hint}
      title={hint ? `${label} (${hint})` : label}
      onClick={onClick}
      className="flex size-10 items-center justify-center text-ink-muted transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink active:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus [&_svg]:size-[1.125rem]"
    >
      {children}
    </button>
  );
}
