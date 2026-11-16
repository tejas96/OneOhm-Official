'use client';

import { cn } from '@oneohm/design-system/web';
import { useMap } from '@vis.gl/react-google-maps';
import { Map as MapIcon, Minus, Plus, Satellite } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

/** Zoom and the satellite switch, in the same glass as the panes (the map's own UI is off). */
export function MapControls({
  satellite,
  onSatellite,
  className,
}: {
  readonly satellite: boolean;
  readonly onSatellite: (satellite: boolean) => void;
  readonly className?: string;
}) {
  const t = useTranslations('liveMap.controls');
  const map = useMap();
  const zoomBy = (step: number) => map?.setZoom((map.getZoom() ?? 12) + step);
  return (
    <div className={cn('pointer-events-auto flex flex-col gap-2', className)}>
      <div className="live-glass flex flex-col overflow-hidden rounded-xl">
        <Control label={t('zoomIn')} onClick={() => zoomBy(1)}>
          <Plus />
        </Control>
        <span aria-hidden className="mx-2 h-px bg-hairline" />
        <Control label={t('zoomOut')} onClick={() => zoomBy(-1)}>
          <Minus />
        </Control>
      </div>
      <div className="live-glass overflow-hidden rounded-xl">
        <Control
          label={satellite ? t('roadmap') : t('satellite')}
          pressed={satellite}
          onClick={() => onSatellite(!satellite)}
        >
          {satellite ? <MapIcon /> : <Satellite />}
        </Control>
      </div>
    </div>
  );
}

function Control({
  label,
  onClick,
  pressed,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly pressed?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className="flex size-10 items-center justify-center text-ink-muted transition-colors duration-(--duration-fast) hover:bg-sunken hover:text-ink [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
