import {
  ILLUSTRATIONS,
  loadIllustration,
  themeAnimation,
} from '@oneohm/design-system/illustrations';
import type { AnimationItem } from 'lottie-web';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from '../theme/reduced-motion';
import { useTheme } from '../theme/theme';
import type { IllustrationProps } from './illustration';

export type { IllustrationName, IllustrationProps } from './illustration';

/** The browser preview always has its player. */
export const canShowIllustrations = (): boolean => true;

/**
 * The browser preview's illustration: the light SVG Lottie player (about 47 KB gzipped,
 * loaded only when one shows) instead of lottie-react-native's web player, which needs
 * a 1.9 MB WebAssembly file. Same behaviour as on the phone: a still final frame under
 * reduced motion, hidden from assistive tech, never in the way of a tap.
 */
export function Illustration({ name, size = 96, scheme, style }: IllustrationProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const colours = scheme ?? theme.scheme;
  const box = useRef<HTMLSpanElement>(null);

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
          loop: ILLUSTRATIONS[name].loop && !reduced,
          autoplay: !reduced,
          animationData: themeAnimation(data, colours),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', focusable: false },
        });
        if (reduced) item.goToAndStop(Math.max(0, data.op - data.ip - 1), true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      item?.destroy();
    };
  }, [name, reduced, colours]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      aria-hidden
      style={[{ width: size, height: size }, style]}
    >
      <span ref={box} style={{ display: 'block', width: size, height: size }} />
    </View>
  );
}
