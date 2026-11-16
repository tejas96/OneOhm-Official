'use client';

import type { LivePerson, LiveSite, LiveStateValue } from '@oneohm/api-contracts';
import { Check, Home, type LucideIcon, Navigation, Pause, WifiOff } from 'lucide-react';
import type { CSSProperties } from 'react';
import { toneOf } from './live-format';
import { useProjection } from './overlay-layer';

/** The small glyph on each pin, so a state never rests on colour alone. */
const GLYPH: Partial<Record<LiveStateValue, LucideIcon>> = {
  on_visit: Home,
  moving: Navigation,
  idle: Pause,
  gap: WifiOff,
};

interface WorkerPinProps {
  readonly person: LivePerson;
  /** Where the pin is drawn (fanned out when people share a spot), in layer pixels. */
  readonly at: { x: number; y: number } | null;
  readonly label: string;
  readonly caption: string | null;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly onSelect: () => void;
}

/** A worker: round initials with a ring in the state's colour, a glyph, and a caption below. */
export function WorkerPin({
  person,
  at,
  label,
  caption,
  selected,
  dimmed,
  onSelect,
}: WorkerPinProps) {
  if (!at) return null;
  const { x, y } = at;
  const Glyph = GLYPH[person.state];
  const style = {
    transform: `translate3d(${x}px, ${y}px, 0)`,
    '--tone': toneOf(person.state),
    zIndex: selected ? 30 : person.state === 'moving' ? 20 : 10,
  } as CSSProperties;
  return (
    <button
      type="button"
      className="live-pin live-worker"
      data-state={person.state}
      data-selected={selected || undefined}
      data-dimmed={dimmed || undefined}
      style={style}
      aria-label={label}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span className="live-worker-body">
        <span aria-hidden className="live-worker-halo" />
        <span
          aria-hidden
          className={`live-worker-disc bg-swatch-${person.person.avatarSwatch % 6}`}
        >
          {person.person.initials}
        </span>
        {Glyph && (
          <span aria-hidden className="live-worker-glyph">
            <Glyph />
          </span>
        )}
      </span>
      {caption && (
        <span aria-hidden className="live-caption">
          {caption}
        </span>
      )}
    </button>
  );
}

interface SitePinProps {
  readonly site: LiveSite;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

/** A customer's site: a small house, outlined when planned, filled while someone is there. */
export function SitePin({ site, label, selected, onSelect }: SitePinProps) {
  const { toPixel } = useProjection();
  const { x, y } = toPixel(site.latitude, site.longitude);
  return (
    <button
      type="button"
      className="live-pin live-site"
      data-status={site.status}
      data-selected={selected || undefined}
      style={{ transform: `translate3d(${x}px, ${y}px, 0)`, zIndex: selected ? 25 : 5 }}
      aria-label={label}
      aria-pressed={selected}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span aria-hidden className="live-site-halo" />
      <svg aria-hidden viewBox="0 0 28 30" className="live-site-house">
        <path d="M14 2.5 2.5 12v14.5a1.5 1.5 0 0 0 1.5 1.5h20a1.5 1.5 0 0 0 1.5-1.5V12L14 2.5Z" />
      </svg>
      {site.status === 'done' && (
        <span aria-hidden className="live-site-mark">
          <Check />
        </span>
      )}
      {site.status === 'late' && <span aria-hidden className="live-site-late" />}
    </button>
  );
}
