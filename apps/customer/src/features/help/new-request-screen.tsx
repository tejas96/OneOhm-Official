import { SERVICE_CATEGORIES, type ServiceRequest } from '@oneohm/api-contracts';
import {
  Button,
  ChoiceChips,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Screen,
  Text,
  unwrap,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { SUPPORT } from '@/copy/care';
import { useChosenProject, useHome } from '@/features/home/use-home';

type Category = ServiceRequest['category'];

/** One question at a time: what kind of problem, which system, and what is happening. */
export function NewRequestScreen() {
  const toast = useToast();
  const client = useQueryClient();
  const home = useHome();
  const projects = home.data?.projects ?? [];
  const { project: chosen } = useChosenProject(projects);
  const [category, setCategory] = useState<Category | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const forProject = projectId ?? chosen?.id ?? null;

  const send = useMutation({
    mutationFn: () =>
      unwrap(
        api.customer.createServiceRequest({
          body: { category: category ?? 'other', projectId: forProject, description },
        }),
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.service });
      toast(SUPPORT.sent);
      setCategory(null);
      setDescription('');
      setError(null);
      router.back();
    },
    onError: (failure) => setError(describeError(failure)),
  });
  const fieldErrors = send.error ? fieldErrorsOf(send.error) : {};

  return (
    <Screen
      footer={
        <Button
          label={SUPPORT.submit}
          onPress={() => send.mutate()}
          pending={send.isPending}
          disabled={!category || description.trim().length < 5}
          fullWidth
        />
      }
    >
      <ScreenHeader title={SUPPORT.formTitle} />
      <Text variant="body" tone="secondary">
        {SUPPORT.formDescription}
      </Text>
      <View style={styles.form}>
        <ChoiceChips
          label={SUPPORT.categoryLabel}
          choices={SERVICE_CATEGORIES.map((value) => ({ value, label: SUPPORT.category[value] }))}
          value={category}
          onChange={setCategory}
        />
        {projects.length > 1 ? (
          <ChoiceChips
            label={SUPPORT.projectLabel}
            choices={projects.map((item) => ({
              value: item.id,
              label: `${item.code} · ${item.place}`,
            }))}
            value={forProject}
            onChange={setProjectId}
          />
        ) : null}
        <Field
          label={SUPPORT.descriptionLabel}
          hint={SUPPORT.descriptionHint}
          error={fieldErrors.description}
        >
          <Input
            value={description}
            accessibilityLabel={SUPPORT.descriptionLabel}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={styles.multiline}
            invalid={Boolean(fieldErrors.description)}
          />
        </Field>
        <FormAlert message={error && !fieldErrors.description ? error : null} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  multiline: { minHeight: 104, textAlignVertical: 'top', paddingTop: 12 },
});
