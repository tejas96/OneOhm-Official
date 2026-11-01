import { LIGHT_COLORS } from '@oneohm/design-system/tokens';
import { Button, Text, useTheme } from '@oneohm/mobile-ui';
import { useState } from 'react';
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Modal,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { TASK } from '@/copy/tasks';
import { type Point, type Stroke, signaturePng } from './signature-png';

/** The pad is paper whatever the theme: dark ink on white, like the printed handover. */
const PAPER = LIGHT_COLORS;

const pointOf = (event: GestureResponderEvent): Point => ({
  x: event.nativeEvent.locationX,
  y: event.nativeEvent.locationY,
});

function pathOf(stroke: Stroke): string {
  const [first, ...rest] = stroke;
  if (!first) return '';
  if (rest.length === 0) return `M${first.x} ${first.y} l0.1 0`;
  return `M${first.x} ${first.y} ${rest.map((point) => `L${point.x} ${point.y}`).join(' ')}`;
}

/** The drawing surface: a finger (or mouse on the web preview) leaves ink. */
function Pad({
  strokes,
  size,
  onStrokes,
  onSize,
}: {
  readonly strokes: readonly Stroke[];
  readonly size: { readonly width: number; readonly height: number };
  readonly onStrokes: (update: (current: readonly Stroke[]) => readonly Stroke[]) => void;
  readonly onSize: (size: { width: number; height: number }) => void;
}) {
  const theme = useTheme();
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => onStrokes((current) => [...current, [pointOf(event)]]),
      onPanResponderMove: (event) =>
        onStrokes((current) => {
          const last = current.at(-1) ?? [];
          return [...current.slice(0, -1), [...last, pointOf(event)]];
        }),
    }),
  );
  return (
    <View
      {...responder.panHandlers}
      onLayout={(event: LayoutChangeEvent) => onSize(event.nativeEvent.layout)}
      accessible
      accessibilityLabel={TASK.signature.padLabel}
      style={[
        styles.pad,
        { backgroundColor: PAPER.surfaceRaised, borderColor: theme.colors.borderStrong },
      ]}
    >
      <Svg
        width={size.width}
        height={size.height}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        {strokes.map((stroke, index) => (
          <Path
            // Strokes only grow at the end, so the index is a stable key.
            // biome-ignore lint/suspicious/noArrayIndexKey: strokes are append-only
            key={index}
            d={pathOf(stroke)}
            stroke={PAPER.textPrimary}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
      <View pointerEvents="none" style={[styles.line, { borderColor: PAPER.borderStrong }]} />
      {strokes.length === 0 ? (
        <View pointerEvents="none" style={styles.hint}>
          <Text variant="bodySm" color={PAPER.textTertiary}>
            {TASK.signature.padHint}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The customer signs on the phone's screen (PRD 3.17 customer sign-off). Saved as a
 * black-on-white PNG; the pad stays white in dark mode so the ink reads like paper.
 */
export function SignaturePad({
  open,
  onClose,
  onSave,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSave: (png: Uint8Array) => void;
}) {
  const theme = useTheme();
  const [strokes, setStrokes] = useState<readonly Stroke[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const close = () => {
    setStrokes([]);
    onClose();
  };
  const save = () => {
    onSave(signaturePng(strokes, size));
    setStrokes([]);
  };
  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={close}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.canvas }]}>
        <View style={styles.header}>
          <Text variant="displayMd">{TASK.signature.padTitle}</Text>
          <Text variant="bodySm" tone="secondary">
            {TASK.signature.padBody}
          </Text>
        </View>
        <Pad strokes={strokes} size={size} onStrokes={setStrokes} onSize={setSize} />
        <View style={styles.flex} />
        <View style={styles.actions}>
          <Button
            label={TASK.signature.cancel}
            variant="quiet"
            onPress={close}
            style={styles.flex}
          />
          <Button
            label={TASK.signature.clear}
            variant="secondary"
            onPress={() => setStrokes([])}
            disabled={strokes.length === 0}
            style={styles.flex}
          />
        </View>
        <Button
          label={TASK.signature.save}
          size="lg"
          fullWidth
          disabled={strokes.length === 0 || size.width === 0}
          onPress={save}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  header: { gap: 4, paddingTop: 16 },
  pad: { height: 260, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  line: { position: 'absolute', left: 24, right: 24, bottom: '30%', borderBottomWidth: 1 },
  hint: { position: 'absolute', left: 24, bottom: '18%' },
  actions: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
