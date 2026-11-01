import { RADIUS } from '@oneohm/design-system/tokens';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme';
import { Button } from './button';
import { Text } from './text';

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly icon?: ReactNode;
  readonly action?: { readonly label: string; readonly onPress: () => void } | undefined;
}

/** A quiet, dashed panel saying what is (not) here and the one thing to do next. */
export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { borderColor: theme.colors.borderStrong }]}>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: theme.colors.accentSoft }]}>{icon}</View>
      ) : null}
      <Text variant="titleMd" align="center">
        {title}
      </Text>
      {description ? (
        <Text variant="bodySm" tone="secondary" align="center">
          {description}
        </Text>
      ) : null}
      {action ? (
        <Button label={action.label} onPress={action.onPress} variant="secondary" size="sm" />
      ) : null}
    </View>
  );
}

/** Shown while a screen loads for the first time. */
export function LoadingState({ label }: { readonly label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.loading} accessibilityLabel={label} accessibilityRole="progressbar">
      <ActivityIndicator color={theme.colors.accent} />
      <Text variant="bodySm" tone="tertiary">
        {label}
      </Text>
    </View>
  );
}

/** Shown when a screen could not load; says why and offers a retry. */
export function ErrorState({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  readonly title: string;
  readonly message: string;
  readonly retryLabel: string;
  readonly onRetry: () => void;
}) {
  return (
    <EmptyState
      title={title}
      description={message}
      action={{ label: retryLabel, onPress: onRetry }}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: RADIUS.xl,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 48 },
});
