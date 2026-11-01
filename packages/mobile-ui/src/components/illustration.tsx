import {
  ILLUSTRATIONS,
  type IllustrationName,
  type IllustrationScheme,
  type LottieAnimation,
  loadIllustration,
  themeAnimation,
} from '@oneohm/design-system/illustrations';
import { useEffect, useState } from 'react';
import { type StyleProp, UIManager, View, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../theme/reduced-motion';
import { useTheme } from '../theme/theme';

export type { IllustrationName } from '@oneohm/design-system/illustrations';

export interface IllustrationProps {
  readonly name: IllustrationName;
  /** Square size in points. */
  readonly size?: number;
  /** Force light or dark colours, e.g. on a surface that is always dark or inverted. */
  readonly scheme?: IllustrationScheme;
  readonly style?: StyleProp<ViewStyle>;
}

type Player = typeof import('lottie-react-native')['default'];

let player: Promise<Player | null> | null = null;

/**
 * Whether this build has the native Lottie view. A build made before lottie-react-native
 * was added has none: callers then keep their icon, and `Illustration` draws nothing.
 */
export function canShowIllustrations(): boolean {
  return UIManager.hasViewManagerConfig('LottieAnimationView');
}

/** The native Lottie view, loaded the first time an illustration shows. */
function loadPlayer(): Promise<Player | null> {
  player ??= import('lottie-react-native').then((module) => module.default).catch(() => null);
  return player;
}

/**
 * A small Lottie illustration (PRD 9.2) for success, rewards and empty states. With
 * reduced motion it shows its final frame still. Decorative: hidden from screen readers
 * and it never takes a touch.
 */
export function Illustration({ name, size = 96, scheme, style }: IllustrationProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [loaded, setLoaded] = useState<{ Player: Player; data: LottieAnimation } | null>(null);

  useEffect(() => {
    if (!canShowIllustrations()) return;
    let cancelled = false;
    void Promise.all([loadPlayer(), loadIllustration(name)])
      .then(([Player, data]) => {
        if (!cancelled && Player) setLoaded({ Player, data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [name]);

  const box = { width: size, height: size };
  if (!canShowIllustrations()) return null;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[box, style]}
    >
      {loaded ? (
        <loaded.Player
          key={reduced ? 'still' : 'moving'}
          source={themeAnimation(loaded.data, scheme ?? theme.scheme)}
          autoPlay={!reduced}
          loop={ILLUSTRATIONS[name].loop && !reduced}
          {...(reduced ? { progress: 1 } : {})}
          style={box}
        />
      ) : null}
    </View>
  );
}
