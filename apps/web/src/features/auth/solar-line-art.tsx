'use client';

import { easing, seconds, useCalmMotion } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import {
  ARRAY_STROKES,
  CALLOUTS,
  EQUIPMENT_STROKES,
  HOME_STROKES,
  type Stroke,
  SUN_STROKES,
  WIRE_PATHS,
} from './solar-line-art-strokes';

const GROUPS = [HOME_STROKES, ARRAY_STROKES, SUN_STROKES, EQUIPMENT_STROKES] as const;

/**
 * A single-line drawing of a rooftop system that draws itself on, then lets
 * current flow from the array to the grid. Under calm motion it simply appears.
 */
export function SolarLineArt({ className }: { readonly className?: string }) {
  const calm = useCalmMotion();
  let order = 0;
  const draw = (stroke: Stroke) => {
    const delay = 0.15 + order * 0.07;
    order += 1;
    // Drawing on sets stroke-dasharray, which would wipe out a dashed pattern, so dashed strokes fade in.
    const drawn = !stroke.dashed;
    return (
      <motion.path
        key={stroke.d}
        d={stroke.d}
        strokeOpacity={stroke.faint ? 0.38 : 0.9}
        strokeDasharray={stroke.dashed ? '3 5' : undefined}
        initial={calm ? false : drawn ? { pathLength: 0, opacity: 0 } : { opacity: 0 }}
        animate={drawn ? { pathLength: 1, opacity: 1 } : { opacity: 1 }}
        transition={{ duration: 1.1, ease: easing('outQuint'), delay }}
      />
    );
  };
  const strokes = GROUPS.flatMap((group) => group.map(draw));
  const flowDelay = calm ? 0 : 0.2 + order * 0.07;
  return (
    <svg
      viewBox="0 0 520 300"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {strokes}
      <motion.g
        initial={calm ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: flowDelay, duration: seconds('slow') }}
      >
        {WIRE_PATHS.map((d) => (
          <g key={d}>
            <path d={d} strokeOpacity={0.55} />
            <path d={d} className="oh-flow" stroke="var(--color-brand-green)" strokeWidth={2} />
          </g>
        ))}
        {CALLOUTS.map((callout) => (
          <g key={callout.letter}>
            <path d={`M${callout.cx} ${callout.cy + 8} V${callout.to}`} strokeOpacity={0.45} />
            <circle cx={callout.cx} cy={callout.cy} r={8} strokeOpacity={0.7} />
            <text
              x={callout.cx}
              y={callout.cy + 3}
              textAnchor="middle"
              fill="currentColor"
              stroke="none"
              className="font-mono text-[8.5px]"
            >
              {callout.letter}
            </text>
          </g>
        ))}
      </motion.g>
    </svg>
  );
}
