import { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { useReducedMotion } from '../theme/reduced-motion';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  readonly style?: StyleProp<ViewStyle>;
  /** How far the surface sinks under the finger (0.97 by default). */
  readonly pressedScale?: number;
}

/** Layout keys that must sit on the outer pressable so the surface sizes like a plain View. */
const OUTER_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width'] as const;

function splitStyle(style: StyleProp<ViewStyle>) {
  const flat: ViewStyle = StyleSheet.flatten(style) ?? {};
  const outer: ViewStyle = {};
  const inner: Record<string, unknown> = { ...flat };
  for (const key of OUTER_KEYS) {
    if (flat[key] !== undefined) {
      (outer as Record<string, unknown>)[key] = flat[key];
      delete inner[key];
    }
  }
  return { outer, inner: inner as ViewStyle };
}

/** A pressable surface that sinks a little under the finger; the base of every tap target. */
export function PressableScale({
  style,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  children,
  ...props
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const { outer, inner } = splitStyle(style);
  const to = (value: number) =>
    // With reduced motion the surface does not move at all.
    reduced
      ? undefined
      : Animated.spring(scale, {
          toValue: value,
          stiffness: 500,
          damping: 40,
          mass: 1,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
  return (
    <Pressable
      {...props}
      style={outer}
      onPressIn={(event) => {
        to(pressedScale);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        to(1);
        onPressOut?.(event);
      }}
    >
      {(state) => (
        <Animated.View style={[inner, { transform: [{ scale }] }]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
