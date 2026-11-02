import { Text, useTheme } from '@oneohm/mobile-ui';

/** A field's message in words, for controls that are not wrapped in a Field (chips). */
export function FieldError({ message }: { readonly message: string | null | undefined }) {
  const color = useTheme().status.overdue.fg;
  if (!message) return null;
  return (
    <Text variant="bodySm" color={color} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
