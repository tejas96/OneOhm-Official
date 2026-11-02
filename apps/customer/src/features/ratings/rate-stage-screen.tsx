import {
  Button,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Screen,
  Text,
  unwrap,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { StarRow } from '@/components/star-row';
import { useToast } from '@/components/toast';
import { COMMON } from '@/copy/common';
import { STAGE_RATING } from '@/copy/ratings';
import { lookup } from '@/i18n/copy';
import { STAGE_RATINGS_KEY, useStageRatings } from './use-stage-ratings';

/** Stars for one finished stage, a comment, and optional stars per person (PRD 5.7). */
export function RateStageScreen() {
  const params = useLocalSearchParams<{ projectId?: string; stage?: string }>();
  const toast = useToast();
  const client = useQueryClient();
  const card = useStageRatings().data?.find(
    (item) => item.projectId === params.projectId && item.stage === params.stage,
  );
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [people, setPeople] = useState<Readonly<Record<string, number>>>({});
  const [commentMissing, setCommentMissing] = useState(false);
  const low = rating > 0 && rating <= 2;
  const send = useMutation({
    mutationFn: () => {
      if (!card) throw new Error(COMMON.loadError);
      return unwrap(
        api.customerStageRatings.rateStage({
          body: {
            projectId: card.projectId,
            stage: card.stage,
            rating,
            comment: comment.trim() || null,
            people: Object.entries(people).map(([userId, stars]) => ({ userId, rating: stars })),
          },
        }),
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: STAGE_RATINGS_KEY });
      toast(STAGE_RATING.sent);
      router.back();
    },
  });
  const errors = send.error ? fieldErrorsOf(send.error) : {};
  const commentError = commentMissing ? STAGE_RATING.commentNeeded : errors.comment;
  const submit = () => {
    // A low rating needs a few words on what went wrong.
    if (low && comment.trim().length < 5) {
      setCommentMissing(true);
      send.reset();
      return;
    }
    send.mutate();
  };
  const stage = card ? (lookup(STAGE_RATING.stage, card.stage) ?? card.stage) : '';
  return (
    <Screen
      footer={
        <Button
          label={STAGE_RATING.submit}
          onPress={submit}
          pending={send.isPending}
          disabled={!card || rating === 0}
          fullWidth
        />
      }
    >
      <ScreenHeader title={STAGE_RATING.screenTitle(stage)} />
      <Text variant="body" tone="secondary">
        {STAGE_RATING.intro}
      </Text>
      <View style={styles.block}>
        <Text variant="label" tone="secondary">
          {STAGE_RATING.overall}
        </Text>
        <StarRow value={rating} onChange={setRating} labels={STAGE_RATING.stars} />
        <Text variant="bodySm" tone="secondary">
          {rating > 0 ? STAGE_RATING.stars[rating - 1] : STAGE_RATING.pick}
        </Text>
      </View>
      <Field
        label={STAGE_RATING.comment}
        hint={low ? STAGE_RATING.commentNeeded : STAGE_RATING.commentHint}
        error={commentError}
        {...(low ? {} : { optional: COMMON.optional })}
      >
        <Input
          value={comment}
          accessibilityLabel={STAGE_RATING.comment}
          onChangeText={(value) => {
            setComment(value);
            if (commentMissing) setCommentMissing(false);
          }}
          multiline
          maxLength={1000}
          style={styles.multiline}
          invalid={Boolean(commentError)}
        />
      </Field>
      {card && card.people.length > 0 ? (
        <View style={styles.block}>
          <Text variant="label" tone="secondary">
            {STAGE_RATING.people}
          </Text>
          <Text variant="bodySm" tone="tertiary">
            {STAGE_RATING.peopleHint}
          </Text>
          {card.people.map((person) => (
            <View key={person.userId} style={styles.person}>
              <View style={styles.name}>
                <Text variant="body">{person.name}</Text>
                {person.crew ? (
                  <Text variant="label" tone="tertiary">
                    {STAGE_RATING.crew(person.crew)}
                  </Text>
                ) : null}
              </View>
              <StarRow
                size={22}
                value={people[person.userId] ?? 0}
                onChange={(stars) => setPeople({ ...people, [person.userId]: stars })}
                labels={STAGE_RATING.stars.map((label) => `${person.name}: ${label}`)}
              />
            </View>
          ))}
        </View>
      ) : null}
      <FormAlert message={send.error ? describeError(send.error) : null} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  block: { gap: 8 },
  person: { gap: 4, paddingVertical: 4 },
  name: { gap: 2 },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
});
