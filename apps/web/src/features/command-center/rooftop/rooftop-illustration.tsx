'use client';

import { easing, useCalmMotion } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useId } from 'react';
import { moduleTable, onLeftFace, onRightFace, polygon, polyline, project } from './iso-geometry';

const W = 6;
const D = 4.4;
const H = 3.2;
const RIM = 0.32;
const WINDOW_X = [0.8, 2.6] as const;

/**
 * An isometric two-storey home with two module tables, its inverter and net meter:
 * the installation the business delivers, drawn from code so it stays crisp and
 * follows the theme. Modules settle onto the roof one by one; current flows to the meter.
 */
export function RooftopIllustration({ className }: { readonly className?: string }) {
  const id = useId();
  const calm = useCalmMotion();
  const modules = [...moduleTable(0.45, H), ...moduleTable(2.45, H)];
  const [sunX, sunY] = [330, 44];
  return (
    <svg viewBox="0 0 380 300" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B5D86" />
          <stop offset="1" stopColor="#05344D" />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#FFE7A3" />
          <stop offset="0.55" stopColor="#F5C14B" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F5C14B" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={sunX} cy={sunY} r={44} fill={`url(#${id}-sun)`} />
      <circle cx={sunX} cy={sunY} r={15} fill="#F7C548" />
      <path
        d={`M${sunX - 18} ${sunY + 14} L${project([3, 1.2, H + 1])[0]} ${project([3, 1.2, H + 1])[1]}`}
        stroke="#F5C14B"
        strokeOpacity={0.45}
        strokeDasharray="3 5"
      />

      <polygon
        points={polygon([
          [-0.9, -0.6, 0],
          [W + 2.2, -0.6, 0],
          [W + 2.2, D + 1.4, 0],
          [-0.9, D + 1.4, 0],
        ])}
        className="fill-ink/[0.06]"
      />
      <circle
        cx={project([-0.4, D + 0.9, 0])[0]}
        cy={project([-0.4, D + 0.9, 0])[1] - 30}
        r={17}
        className="fill-energy/70"
      />
      <path
        d={polyline([
          [-0.4, D + 0.9, 0],
          [-0.4, D + 0.9, 0.9],
        ])}
        className="stroke-ink-faint"
        strokeWidth={2}
      />

      <polygon
        points={onLeftFace(D, 0, W, 0, H + RIM)}
        className="fill-sunken stroke-rule"
        strokeWidth={0.75}
      />
      <polygon
        points={onRightFace(W, 0, D, 0, H + RIM)}
        className="fill-raised stroke-rule"
        strokeWidth={0.75}
      />
      <polygon
        points={polygon([
          [0, 0, H + RIM],
          [W, 0, H + RIM],
          [W, D, H + RIM],
          [0, D, H + RIM],
        ])}
        className="fill-raised stroke-rule"
        strokeWidth={0.75}
      />
      <polygon
        points={polygon([
          [RIM, RIM, H],
          [W - RIM, RIM, H],
          [W - RIM, D - RIM, H],
          [RIM, D - RIM, H],
        ])}
        className="fill-surface stroke-hairline"
        strokeWidth={0.75}
      />
      <path
        d={polyline([
          [0, D, 1.6],
          [W, D, 1.6],
          [W, 0, 1.6],
        ])}
        className="stroke-rule"
        strokeWidth={0.6}
        fill="none"
      />

      {[0.8, 2.6, 4.4].map((x) => (
        <polygon
          key={`up-${x}`}
          points={onLeftFace(D, x, x + 1, 2.0, 2.75)}
          className="fill-accent-soft stroke-rule"
          strokeWidth={0.75}
        />
      ))}
      {WINDOW_X.map((x) => (
        <polygon
          key={`low-${x}`}
          points={onLeftFace(D, x, x + 1, 0.45, 1.2)}
          className="fill-accent-soft stroke-rule"
          strokeWidth={0.75}
        />
      ))}
      <polygon
        points={onLeftFace(D, 4.45, 5.25, 0, 1.35)}
        className="fill-swatch-3/70 stroke-rule"
        strokeWidth={0.75}
      />
      {[0.7, 2.5].map((y) => (
        <polygon
          key={`side-${y}`}
          points={onRightFace(W, y, y + 1, 2.0, 2.75)}
          className="fill-accent-soft stroke-rule"
          strokeWidth={0.75}
        />
      ))}

      {modules.map((module, index) => (
        <motion.g
          key={module.key}
          initial={calm ? false : { opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: easing('outQuint'), delay: 0.3 + index * 0.07 }}
        >
          <polygon
            points={module.face}
            fill={`url(#${id}-glass)`}
            stroke="#9FD3EA"
            strokeOpacity={0.6}
            strokeWidth={0.6}
          />
          <path
            d={module.cells}
            stroke="#9FD3EA"
            strokeOpacity={0.35}
            strokeWidth={0.5}
            fill="none"
          />
        </motion.g>
      ))}

      <polygon
        points={onRightFace(W + 0.28, 2.9, 3.6, 1.0, 1.85)}
        className="fill-raised stroke-ink-faint"
        strokeWidth={0.75}
      />
      <polygon
        points={onLeftFace(3.6, W, W + 0.28, 1.0, 1.85)}
        className="fill-sunken stroke-ink-faint"
        strokeWidth={0.75}
      />
      <path
        d={polyline([
          [W + 1.6, D + 0.4, 0],
          [W + 1.6, D + 0.4, 1.5],
        ])}
        className="stroke-ink-faint"
        strokeWidth={1.5}
      />
      <polygon
        points={onRightFace(W + 1.6, D + 0.15, D + 0.65, 1.25, 1.85)}
        className="fill-raised stroke-ink-faint"
        strokeWidth={0.75}
      />

      {[
        [
          [5.4, 3.8, H + 0.45],
          [W - 0.1, 3.25, H + RIM],
          [W + 0.28, 3.25, 1.85],
        ],
        [
          [W + 0.28, 3.4, 1.2],
          [W + 1.6, D + 0.4, 1.4],
        ],
      ].map((points) => (
        <g key={JSON.stringify(points)}>
          <path
            d={polyline(points as [number, number, number][])}
            className="stroke-ink-faint"
            strokeWidth={1}
            fill="none"
          />
          <path
            d={polyline(points as [number, number, number][])}
            className="oh-flow"
            stroke="var(--color-brand-green)"
            strokeWidth={2}
            fill="none"
          />
        </g>
      ))}
      <motion.circle
        cx={sunX}
        cy={sunY}
        r={22}
        fill="none"
        stroke="#F7C548"
        strokeOpacity={0.4}
        initial={calm ? false : { scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: easing('outQuint') }}
      />
    </svg>
  );
}
