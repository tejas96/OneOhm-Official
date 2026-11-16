'use client';

import type { LivePerson, LiveSite, LiveStateValue } from '@oneohm/api-contracts';
import { Check, Home, type LucideIcon, Navigation, Pause, WifiOff } from 'lucide-react';
import type { CSSProperties } from 'react';
import { toneOf } from './live-format';
import { usePinLayout } from './overlay-layer';

/** The small glyph on each pin, so a state never rests on colour alone. */
const GLYPH: Partial<Record<LiveStateValue, LucideIcon>> = {
  on_visit: Home,
  moving: Navigation,
  idle: Pause,
  gap: WifiOff,
};

interface WorkerPinProps {
  readonly person: LivePerson;
  readonly label: string;
  /** The caption's words; whether it fits is decided by the layout when the map rests. */
  readonly caption: string | null;
  readonly selected: boolean;
  readonly dimmed: boolean;
  readonly onSelect: () => void;
}

/**
 * A worker: round initials with a ring in the state's colour, a glyph, a red badge with the
 * open alerts, and a caption below. Where it sits is set by `PinLayout`, not by this render.
 */
export function WorkerPin({ person, label, caption, selected, dimmed, onSelect }: WorkerPinProps) {
  const layout = usePinLayout();
  const Glyph = GLYPH[person.state];
  const alerts = person.alerts.open;
  const style = {
    '--tone': toneOf(person.state),
  } as CSSProperties;
  return (
    <button
      ref={layout.ref(person.person.id, 'worker')}
      type="button"
      className="live-pin live-worker"
      data-state={person.state}
      data-selected={selected || undefined}
      data-dimmed={dimmed || undefined}
      data-alerts={alerts > 0 || undefined}
      style={style}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
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
        {alerts > 0 && (
          <span
            aria-hidden
            className="live-worker-alerts"
            data-red={person.alerts.red > 0 || undefined}
          >
            {alerts > 9 ? '9+' : alerts}
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
  const layout = usePinLayout();
  return (
    <button
      ref={layout.ref(site.id, 'site')}
      type="button"
      className="live-pin live-site"
      data-status={site.status}
      data-selected={selected || undefined}
      style={{ zIndex: selected ? 25 : 5 }}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
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
