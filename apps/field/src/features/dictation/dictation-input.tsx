import { Input, type InputProps, PressableScale, Text, useTheme } from '@oneohm/mobile-ui';
import { Mic, Square } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { DICTATE } from '@/copy/capture';
import { useDictation } from './use-dictation';

type Props = Omit<InputProps, 'value' | 'onChangeText'> & {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
};

/**
 * A note box with a small microphone: tap it and speak, the words land in the box, tap
 * again (or stop talking) to finish, then edit as usual. Where speech recognition is not
 * available the microphone is simply not there.
 */
export function DictationInput({ value, onChangeText, style, editable, ...props }: Props) {
  const theme = useTheme();
  const dictation = useDictation();
  if (!dictation.available) {
    return (
      <Input
        {...props}
        value={value}
        onChangeText={onChangeText}
        style={style}
        editable={editable}
      />
    );
  }
  const { listening, problem } = dictation;
  const toggle = () => {
    if (listening) dictation.stop();
    else void dictation.start(value, onChangeText);
  };
  return (
    <View style={styles.wrap}>
      <View>
        <Input
          {...props}
          value={value}
          onChangeText={onChangeText}
          editable={editable !== false && !listening}
          style={[styles.roomForMic, style]}
        />
        <View style={styles.micSpot}>
          <PressableScale
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={listening ? DICTATE.stop : DICTATE.start}
            accessibilityState={{ selected: listening }}
            hitSlop={8}
            style={[
              styles.mic,
              { backgroundColor: listening ? theme.colors.accent : theme.colors.surfaceSunken },
            ]}
          >
            {listening ? (
              <Square size={14} color={theme.colors.onAccent} fill={theme.colors.onAccent} />
            ) : (
              <Mic size={18} color={theme.colors.textSecondary} />
            )}
          </PressableScale>
        </View>
      </View>
      {listening || problem ? (
        <Text
          variant="bodySm"
          color={listening ? theme.colors.textSecondary : theme.status.atRisk.fg}
          accessibilityLiveRegion="polite"
        >
          {listening ? DICTATE.listening : problem ? DICTATE[problem] : ''}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  roomForMic: { paddingRight: 40 },
  micSpot: { position: 'absolute', right: 8, bottom: 8 },
  mic: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
