'use client';

import { animate, motion, useDragControls, useMotionValue } from 'motion/react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useRef, useState } from 'react';

export type SheetStop = 'peek' | 'half' | 'full';

/** Visible height of each stop: the peek shows the header and two rows. */
const PEEK_PX = 168;
const SPRING = { type: 'spring', stiffness: 380, damping: 38 } as const;
const visibleAt = (stop: SheetStop, height: number) =>
  stop === 'peek' ? PEEK_PX : stop === 'half' ? Math.round(height * 0.55) : height;

interface BottomSheetProps {
  readonly stop: SheetStop;
  readonly onStop: (stop: SheetStop) => void;
  readonly header: ReactNode;
  readonly children: ReactNode;
}

/**
 * Phones: the panel as a sheet over the map. Drag the handle (or tap it) between a peek, half
 * and full height; it settles on the nearest stop, or the next one with a flick.
 */
export function BottomSheet({ stop, onStop, header, children }: BottomSheetProps) {
  const t = useTranslations('liveMap.sheet');
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(640);
  const controls = useDragControls();
  const y = useMotionValue(height - PEEK_PX);
  useEffect(() => {
    const element = frame.current?.parentElement;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(Math.round(element.clientHeight * 0.88)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const offsetOf = (at: SheetStop) => height - visibleAt(at, height);
  const target = offsetOf(stop);
  useEffect(() => {
    const run = animate(y, target, SPRING);
    return () => run.stop();
  }, [y, target]);
  const stops: SheetStop[] = ['full', 'half', 'peek'];
  const settle = (offset: number, velocity: number) => {
    const current = offsetOf(stop) + offset;
    const ranked = [...stops].sort(
      (a, b) => Math.abs(offsetOf(a) - current) - Math.abs(offsetOf(b) - current),
    );
    let next = ranked[0] ?? stop;
    if (Math.abs(velocity) > 600) {
      const index = stops.indexOf(stop) + (velocity > 0 ? 1 : -1);
      next = stops[Math.min(stops.length - 1, Math.max(0, index))] ?? next;
    }
    // The same stop again still springs back from wherever the drag let go.
    if (next === stop) animate(y, offsetOf(next), SPRING);
    onStop(next);
  };
  return (
    <motion.div
      ref={frame}
      className="live-glass live-pane pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl"
      style={{ height, y }}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: offsetOf('peek') }}
      dragElastic={0.04}
      dragMomentum={false}
      onDragEnd={(_, info) => settle(info.offset.y, info.velocity.y)}
    >
      <button
        type="button"
        aria-label={stop === 'full' ? t('collapse') : t('expand')}
        onPointerDown={(event) => controls.start(event)}
        onClick={() => onStop(stop === 'peek' ? 'half' : stop === 'half' ? 'full' : 'peek')}
        className="flex h-7 w-full shrink-0 touch-none items-center justify-center"
      >
        <span aria-hidden className="h-1.5 w-11 rounded-full bg-rule" />
      </button>
      {header}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
    </motion.div>
  );
}
