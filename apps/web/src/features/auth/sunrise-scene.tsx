'use client';

import { cn, easing, useCalmMotion } from '@oneohm/design-system/web';
import { motion } from 'motion/react';
import { useNow, useTranslations } from 'next-intl';
import { useId } from 'react';
import {
  ARRAY_STROKES,
  EQUIPMENT_STROKES,
  HOME_STROKES,
  WIRE_PATHS,
} from './solar-line-art-strokes';
import { dayProgress, localHours, pointOnArc, skyPhase } from './sun-path';

const ARC = { start: [8, 262], control: [260, -300], end: [512, 262] } as const;
const PANEL_TARGETS = [
  [120, 118],
  [210, 118],
] as const;
const STARS = [
  [60, -40],
  [130, -66],
  [210, -12],
  [300, -72],
  [380, -30],
  [450, -8],
  [470, -62],
  [30, 34],
] as const;

/**
 * Phones: a calm sky above the rooftop drawing. The sun sits where it is over the
 * business right now and rises into place; after sunset a moon and a few stars
 * take over. A short greeting matches the hour.
 */
export function SunriseScene({ className }: { readonly className?: string }) {
  const t = useTranslations('signIn.sky');
  const calm = useCalmMotion();
  const glowId = useId();
  const now = useNow({ updateInterval: 60_000 });
  const hours = localHours(now, 'Asia/Kolkata');
  const phase = skyPhase(hours);
  const night = phase === 'night';
  const [sunX, sunY] = pointOnArc(
    night ? 0.72 : dayProgress(hours),
    ARC.start,
    ARC.control,
    ARC.end,
  );
  const [riseX, riseY] = ARC.start;
  const lines = night ? 'text-on-panel' : 'text-ink';
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

      <svg
        viewBox="0 -80 520 370"
        aria-hidden
        className={cn('pointer-events-none -mx-6 mt-1 w-[calc(100%+3rem)]', lines)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <defs>
          <radialGradient id={glowId}>
            <stop offset="0" stopColor={night ? '#EEF5F4' : '#FFE7A3'} stopOpacity={0.9} />
            <stop offset="1" stopColor={night ? '#EEF5F4' : '#F5C14B'} stopOpacity={0} />
          </radialGradient>
        </defs>
        <path
          d={`M${ARC.start.join(' ')} Q${ARC.control.join(' ')} ${ARC.end.join(' ')}`}
          strokeOpacity={0.28}
          strokeDasharray="2 7"
        />
        {night &&
          STARS.map(([x, y]) => (
            <circle
              key={`${x}-${y}`}
              cx={x}
              cy={y}
              r={1.4}
              fill="currentColor"
              stroke="none"
              opacity={0.7}
            />
          ))}
        <motion.g
          initial={calm ? false : { x: riseX - sunX, y: riseY - sunY, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ duration: 2.2, ease: easing('outQuint'), delay: 0.2 }}
        >
          <circle cx={sunX} cy={sunY} r={52} fill={`url(#${glowId})`} stroke="none" />
          {night ? (
            <path
              d={`M${sunX + 4} ${sunY - 15} a15 15 0 1 0 11 24 a12 12 0 1 1 -11 -24 Z`}
              fill="#EEF5F4"
              stroke="none"
            />
          ) : (
            <circle cx={sunX} cy={sunY} r={15} fill="#F7C548" stroke="none" />
          )}
        </motion.g>
        {!night &&
          PANEL_TARGETS.map(([x, y]) => (
            <motion.path
              key={x}
              d={`M${sunX} ${sunY} L${x} ${y}`}
              stroke="#E0A92E"
              strokeOpacity={0.45}
              strokeDasharray="3 6"
              initial={calm ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1, delay: 2.1 }}
            />
          ))}
        {[...HOME_STROKES, ...ARRAY_STROKES, ...EQUIPMENT_STROKES].map((stroke, index) => (
          <motion.path
            key={stroke.d}
            d={stroke.d}
            strokeOpacity={stroke.faint ? 0.3 : 0.75}
            strokeDasharray={stroke.dashed ? '3 5' : undefined}
            initial={calm ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 1, ease: easing('outQuint'), delay: 0.1 + index * 0.05 }}
          />
        ))}
        {WIRE_PATHS.map((d) => (
          <g key={d}>
            <path d={d} strokeOpacity={0.5} />
            {!night && (
              <path d={d} className="oh-flow" stroke="var(--color-energy)" strokeWidth={2.2} />
            )}
          </g>
        ))}
      </svg>
    </section>
  );
}
