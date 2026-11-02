import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  PressableScale,
  Screen,
  Text,
  unwrap,
  useTheme,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { RATE } from '@/copy/after-sales';
import { COMMON } from '@/copy/common';

/** A starting rating from the link: a whole number 1-5, otherwise none. */
export function startingRating(value: string | undefined): number {
  const stars = Number(value);
  return Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 0;
}

/** One to five stars for how a resolved request was handled, with an optional comment. */
export function RateRequestScreen() {
  const params = useLocalSearchParams<{ requestId?: string; rating?: string }>();
  const requestId = params.requestId ?? '';
  const theme = useTheme();
  const toast = useToast();
  const client = useQueryClient();
  const [rating, setRating] = useState(() => startingRating(params.rating));
  const [comment, setComment] = useState('');
  const send = useMutation({
    mutationFn: () => {
      if (!requestId) throw new Error(COMMON.loadError);
      return unwrap(
        api.customerAfterSales.rateServiceRequest({
          params: { id: requestId },
          body: { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) },
        }),
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.service });
      toast(RATE.sent);
      router.back();
    },
  });
  const errors = send.error ? fieldErrorsOf(send.error) : {};
  return (
    <Screen
      footer={
        <Button
          label={RATE.submit}
          onPress={() => send.mutate()}
          pending={send.isPending}
          disabled={rating === 0 || !requestId}
          fullWidth
        />
      }
    >
      <ScreenHeader title={RATE.title} />
      <Text variant="body" tone="secondary">
        {RATE.intro}
      </Text>
      <View style={styles.form}>
        <View style={styles.rating}>
          <Text variant="label" tone="secondary">
            {RATE.ratingLabel}
          </Text>
          <View style={styles.stars} accessibilityRole="radiogroup">
            {RATE.stars.map((label, index) => {
              const value = index + 1;
              const on = value <= rating;
              return (
                <PressableScale
                  key={label}
                  accessibilityRole="radio"
                  accessibilityLabel={label}
                  accessibilityState={{ checked: value === rating }}
                  onPress={() => setRating(value)}
                  style={styles.star}
                >
                  <Star
                    size={32}
                    color={on ? theme.colors.energy : theme.colors.textTertiary}
                    fill={on ? theme.colors.energy : 'transparent'}
                  />
                </PressableScale>
              );
            })}
          </View>
          <Text variant="bodySm" tone="secondary">
            {rating > 0 ? RATE.stars[rating - 1] : RATE.pick}
          </Text>
        </View>
        <Field
          label={RATE.commentLabel}
          hint={RATE.commentHint}
          optional={COMMON.optional}
          error={errors.comment}
        >
          <Input
            value={comment}
            accessibilityLabel={RATE.commentLabel}
            onChangeText={setComment}
            multiline
            maxLength={2000}
            style={styles.multiline}
            invalid={Boolean(errors.comment)}
          />
        </Field>
        <FormAlert message={send.error ? describeError(send.error) : null} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  rating: { gap: 8 },
  stars: { flexDirection: 'row', gap: 4 },
  star: { padding: 6 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
});
