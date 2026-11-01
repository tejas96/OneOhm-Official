import { BRAND_GRADIENT_STOPS } from '@oneohm/design-system/tokens';
import { type ReactNode, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../theme/theme';

export interface ProgressRingProps {
  /** 0 to 1. */
  readonly value: number;
  readonly size?: number;
  readonly thickness?: number;
  /** `brand` paints the logo gradient; otherwise a solid colour. */
  readonly paint?: 'brand' | string;
  readonly label: string;
  readonly children?: ReactNode;
}

/** A ring that fills clockwise from the top, with anything centred inside it. */
export function ProgressRing({
  value,
  size = 64,
  thickness = 6,
  paint = 'brand',
  label,
  children,
}: ProgressRingProps) {
  const theme = useTheme();
  const gradientId = useId().replace(/:/g, '');
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <View
      style={{ width: size, height: size }}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            {BRAND_GRADIENT_STOPS.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </LinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.colors.surfaceSunken}
          strokeWidth={thickness}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={paint === 'brand' ? `url(#${gradientId})` : paint}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.centre]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({ centre: { alignItems: 'center', justifyContent: 'center' } });
