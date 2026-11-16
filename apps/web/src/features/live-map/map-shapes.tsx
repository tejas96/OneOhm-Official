'use client';

import type { LivePerson, LiveSites } from '@oneohm/api-contracts';
import { toneOf } from './live-format';
import { useFrame } from './overlay-layer';
import type { Frame } from './pin-layout';

/** Metres north of a latitude, in degrees. */
const northOf = (metres: number) => metres / 111_195;

/**
 * Under the pins: the work places as soft circles at their real radius, and a short tail
 * behind each moving worker that fades towards its oldest point.
 */
export function MapShapes({
  people,
  offices,
}: {
  readonly people: readonly LivePerson[];
  readonly offices: LiveSites['offices'];
}) {
  const frame = useFrame();
  if (!frame) return null;
  const { toPixel, zoom } = frame;
  return (
    <svg aria-hidden className="live-shapes-svg" width="1" height="1">
      {offices.map((office) => {
        const centre = toPixel(office.latitude, office.longitude);
        const edge = toPixel(office.latitude + northOf(office.radiusM), office.longitude);
        const radius = Math.max(10, Math.abs(centre.y - edge.y));
        return (
          <g key={office.id} className="live-office">
            <circle cx={centre.x} cy={centre.y} r={radius} />
            {zoom >= 13 && (
              <text x={centre.x} y={centre.y - radius - 6} textAnchor="middle">
                {office.name}
              </text>
            )}
          </g>
        );
      })}
      {people.map((person) => (
        // A new last point remounts the tail, so it fades in again behind the gliding pin.
        <Tail key={`${person.person.id}:${person.tail.at(-1)?.at}`} person={person} frame={frame} />
      ))}
    </svg>
  );
}

function Tail({ person, frame }: { readonly person: LivePerson; readonly frame: Frame }) {
  const { toPixel } = frame;
  if (person.state !== 'moving' || person.tail.length < 2) return null;
  const points = person.tail.map((point) => toPixel(point.latitude, point.longitude));
  const segments = points.slice(1).map((to, index) => ({ from: points[index] ?? to, to, index }));
  return (
    <g className="live-tail" style={{ stroke: toneOf(person.state) }}>
      {segments.map(({ from, to, index }) => (
        <line
          key={index}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          strokeOpacity={0.12 + 0.78 * ((index + 1) / segments.length) ** 1.6}
        />
      ))}
    </g>
  );
}
