'use client';

import type { AnimationItem } from 'lottie-web';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  ILLUSTRATIONS,
  type IllustrationName,
  type IllustrationScheme,
  loadIllustration,
  themeAnimation,
} from '../../illustrations';
import { cn } from '../lib/cn';
import { useCalmMotion } from '../motion/motion-preference';

function subscribeScheme(onChange: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => {
    media.removeEventListener('change', onChange);
    observer.disconnect();
  };
}

/** The page's scheme: a chosen `data-theme`, or else the system setting. */
function readScheme(): IllustrationScheme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function usePageScheme(): IllustrationScheme {
  return useSyncExternalStore(subscribeScheme, readScheme, () => 'light');
}

interface IllustrationProps {
  readonly name: IllustrationName;
  /** Square size in px. */
  readonly size?: number;
  /** Force light or dark colours, e.g. on a surface that is always dark. */
  readonly scheme?: IllustrationScheme;
  readonly className?: string;
}

/**
 * A small Lottie illustration (PRD 9.2). The light SVG player (about 47 KB gzipped) and
 * the animation load only when one is shown. Under reduced motion or Calm motion it shows
 * its final frame still. Decorative: hidden from assistive tech and never takes a click.
 */
export function Illustration({ name, size = 96, scheme, className }: IllustrationProps) {
  const box = useRef<HTMLSpanElement>(null);
  const calm = useCalmMotion();
  const page = usePageScheme();
  const colours = scheme ?? page;

  useEffect(() => {
    let item: AnimationItem | undefined;
    let cancelled = false;
    void Promise.all([import('lottie-web/build/player/lottie_light'), loadIllustration(name)])
      .then(([player, data]) => {
        const container = box.current;
        if (cancelled || !container) return;
        item = player.default.loadAnimation({
          container,
          renderer: 'svg',
          loop: ILLUSTRATIONS[name].loop && !calm,
          autoplay: !calm,
          animationData: themeAnimation(data, colours),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', focusable: false },
        });
        if (calm) item.goToAndStop(Math.max(0, data.op - data.ip - 1), true);
      })
      // Decorative: when it cannot load, the space simply stays empty.
      .catch(() => undefined);
    return () => {
      cancelled = true;
      item?.destroy();
    };
  }, [name, calm, colours]);

  return (
    <span
      ref={box}
      aria-hidden
      className={cn('pointer-events-none inline-block shrink-0 [&_svg]:block', className)}
      style={{ width: size, height: size }}
    />
  );
}
