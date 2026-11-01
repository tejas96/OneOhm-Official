import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Image,
  type ImageSourcePropType,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { Text } from '../components/text';
import { useTheme } from '../theme/theme';
import {
  ARRAY_STROKES,
  EQUIPMENT_STROKES,
  HOME_STROKES,
  WIRE_PATHS,
} from './solar-line-art-strokes';
import { dayProgress, localHours, pointOnArc, type SkyPhase, skyPhase } from './sun-path';

const ARC = { start: [8, 262], control: [260, -300], end: [512, 262] } as const;
const VIEW_BOX = '0 -80 520 370';
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

export interface SunriseSkyProps {
  readonly logo: ImageSourcePropType;
  readonly logoNight: ImageSourcePropType;
  readonly logoLabel: string;
  readonly hello: Readonly<Record<SkyPhase, string>>;
  readonly line: Readonly<Record<SkyPhase, string>>;
  readonly timeZone?: string;
}

/**
 * The sign-in brand moment: a calm sky over the rooftop drawing. The sun sits where it
 * is over Sangli right now and rises into place; after sunset a moon and stars.
 */
export function SunriseSky({
  logo,
  logoNight,
  logoLabel,
  hello,
  line,
  timeZone = 'Asia/Kolkata',
}: SunriseSkyProps) {
  const theme = useTheme();
  const hours = localHours(new Date(), timeZone);
  const phase = skyPhase(hours);
  const night = phase === 'night';
  const [sunX, sunY] = pointOnArc(
    night ? 0.72 : dayProgress(hours),
    ARC.start,
    ARC.control,
    ARC.end,
  );
  const ink = night ? theme.ocean.onPanel : theme.colors.textPrimary;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) rise.setValue(1);
      else
        Animated.timing(rise, {
          toValue: 1,
          duration: 2000,
          delay: 200,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [rise]);

  const top = night ? theme.ocean.panelDeep : theme.colors.accentSoft;
  const middle = night ? theme.ocean.panel : theme.colors.energySoft;
  return (
    <View style={styles.root} accessibilityLabel={logoLabel}>
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="oh-sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="0.62" stopColor={middle} />
            <Stop offset="1" stopColor={theme.colors.canvas} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#oh-sky)" />
      </Svg>
      <View style={styles.header}>
        <Image
          source={night ? logoNight : logo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text
          variant="overline"
          color={night ? theme.ocean.onPanelMuted : theme.colors.textSecondary}
        >
          {hello[phase]}
        </Text>
        <Text variant="displayMd" color={ink}>
          {line[phase]}
        </Text>
      </View>
      <View style={styles.drawing}>
        <Svg
          width="100%"
          height="100%"
          viewBox={VIEW_BOX}
          style={StyleSheet.absoluteFill}
          fill="none"
          stroke={ink}
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path
            d={`M${ARC.start.join(' ')} Q${ARC.control.join(' ')} ${ARC.end.join(' ')}`}
            strokeOpacity={0.28}
            strokeDasharray="2 7"
          />
          {night
            ? STARS.map(([x, y]) => (
                <Circle
                  key={`${x}-${y}`}
                  cx={x}
                  cy={y}
                  r={1.4}
                  fill={ink}
                  stroke="none"
                  opacity={0.7}
                />
              ))
            : null}
          {[...HOME_STROKES, ...ARRAY_STROKES, ...EQUIPMENT_STROKES].map((stroke) => (
            <Path
              key={stroke.d}
              d={stroke.d}
              strokeOpacity={stroke.faint ? 0.3 : 0.75}
              {...(stroke.dashed ? { strokeDasharray: '3 5' } : {})}
            />
          ))}
          {WIRE_PATHS.map((d) => (
            <G key={d}>
              <Path d={d} strokeOpacity={0.5} />
              {night ? null : (
                <Path d={d} stroke={theme.colors.energy} strokeWidth={2.2} strokeDasharray="6 10" />
              )}
            </G>
          ))}
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: rise,
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
              ],
            },
          ]}
        >
          <Svg width="100%" height="100%" viewBox={VIEW_BOX} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="oh-sun-glow">
                <Stop offset="0" stopColor={night ? '#EEF5F4' : '#FFE7A3'} stopOpacity={0.9} />
                <Stop offset="1" stopColor={night ? '#EEF5F4' : '#F5C14B'} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={sunX} cy={sunY} r={52} fill="url(#oh-sun-glow)" />
            {night ? (
              <Path
                d={`M${sunX + 4} ${sunY - 15} a15 15 0 1 0 11 24 a12 12 0 1 1 -11 -24 Z`}
                fill="#EEF5F4"
              />
            ) : (
              <Circle cx={sunX} cy={sunY} r={15} fill="#F7C548" />
            )}
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', paddingTop: 12, paddingBottom: 20 },
  header: { paddingHorizontal: 24, gap: 6 },
  logo: { width: 112, height: 36, marginBottom: 8 },
  drawing: { width: '100%', aspectRatio: 520 / 370, marginTop: 4 },
});
