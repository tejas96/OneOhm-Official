import {
  Button,
  ChoiceChips,
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
import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Star } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { FEEDBACK } from '@/copy/care';
import { COMMON } from '@/copy/common';
import { useChosenProject, useHome } from '@/features/home/use-home';

/** One to five stars for a project, with an optional comment (PRD 5.7). */
export function FeedbackScreen() {
  const params = useLocalSearchParams<{ projectId?: string }>();
  const theme = useTheme();
  const toast = useToast();
  const projects = useHome().data?.projects ?? [];
  const { project: chosen } = useChosenProject(projects);
  const [projectId, setProjectId] = useState<string | null>(params.projectId ?? null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const forProject = projectId ?? chosen?.id ?? null;
  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.customer.giveFeedback({
          body: {
            projectId: forProject ?? '',
            rating,
            ...(comment.trim() ? { comment: comment.trim() } : {}),
          },
        }),
      ),
    onSuccess: () => {
      toast(FEEDBACK.sent);
      setRating(0);
      setComment('');
      router.back();
    },
  });
  const errors = send.error ? fieldErrorsOf(send.error) : {};
  return (
    <Screen
      footer={
        <Button
          label={FEEDBACK.submit}
          onPress={() => send.mutate()}
          pending={send.isPending}
          disabled={rating === 0 || !forProject}
          fullWidth
        />
      }
    >
      <ScreenHeader title={FEEDBACK.title} />
      <Text variant="body" tone="secondary">
        {FEEDBACK.intro}
      </Text>
      <View style={styles.form}>
        {projects.length > 1 ? (
          <ChoiceChips
            label={COMMON.tabs.home}
            choices={projects.map((item) => ({
              value: item.id,
              label: `${item.code} · ${item.place}`,
            }))}
            value={forProject}
            onChange={setProjectId}
          />
        ) : null}
        <View style={styles.rating}>
          <Text variant="label" tone="secondary">
            {FEEDBACK.ratingLabel}
          </Text>
          <View style={styles.stars} accessibilityRole="radiogroup">
            {FEEDBACK.stars.map((label, index) => {
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
            {rating > 0 ? FEEDBACK.stars[rating - 1] : FEEDBACK.pickRating}
          </Text>
        </View>
        <Field
          label={FEEDBACK.commentLabel}
          hint={FEEDBACK.commentHint}
          optional={COMMON.optional}
          error={errors.comment}
        >
          <Input
            value={comment}
            accessibilityLabel={FEEDBACK.commentLabel}
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
