import type { ThemeColors } from '@oneohm/design-system/tokens';
import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';
import { useTheme } from '../theme/theme';
import {
  ITALIC_DISPLAY_FACE,
  MAX_FONT_SCALE,
  TEXT_STYLES,
  type TextVariant,
} from '../theme/typography';

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'onAccent'
  | 'onPanel'
  | 'onPanelMuted'
  | 'energy';

const TONE_COLOR: Readonly<Record<TextTone, keyof ThemeColors>> = {
  primary: 'textPrimary',
  secondary: 'textSecondary',
  tertiary: 'textTertiary',
  accent: 'accent',
  onAccent: 'onAccent',
  onPanel: 'onPanel',
  onPanelMuted: 'onPanelMuted',
  energy: 'energy',
};

export interface TextProps extends NativeTextProps {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
  /** Overrides `tone`, e.g. a status foreground colour. */
  readonly color?: string;
  readonly italic?: boolean;
  readonly align?: 'left' | 'center' | 'right';
}

/** All text goes through here so type, colour and Dynamic Type limits stay consistent. */
export function Text({
  variant = 'body',
  tone = 'primary',
  color,
  italic = false,
  align,
  style,
  ...props
}: TextProps) {
  const theme = useTheme();
  const heading = variant.startsWith('display') || variant === 'hero' || variant === 'titleLg';
  return (
    <NativeText
      maxFontSizeMultiplier={MAX_FONT_SCALE[variant]}
      {...(heading ? { accessibilityRole: 'header' as const } : {})}
      {...props}
      style={[
        TEXT_STYLES[variant],
        { color: color ?? theme.colors[TONE_COLOR[tone]] },
        italic && (variant.startsWith('display') || variant === 'hero')
          ? { fontFamily: ITALIC_DISPLAY_FACE }
          : null,
        align ? { textAlign: align } : null,
        style,
      ]}
    />
  );
}
