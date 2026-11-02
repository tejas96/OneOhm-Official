import {
  Button,
  ChoiceChips,
  describeError,
  Field,
  fieldErrorsOf,
  Input,
  Screen,
  Text,
  type UploadableFile,
  unwrap,
} from '@oneohm/mobile-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { api, keys } from '@/api/api';
import { FieldError } from '@/components/field-error';
import { FormAlert } from '@/components/form-alert';
import { ScreenHeader } from '@/components/screen-header';
import { useToast } from '@/components/toast';
import { COVER } from '@/copy/after-sales';
import { SUPPORT } from '@/copy/care';
import { REQUEST_MEDIA } from '@/copy/request-media';
import { useChosenProject, useHome } from '@/features/home/use-home';
import { PhotoStrip } from './photo-strip';
import { MAX_REQUEST_PHOTOS, pickRequestPhotos, sendRequestPhotos } from './request-photos';
import { useServiceCategories } from './use-after-sales';
import { type PickedVideo, VideoField } from './video-field';
import { type RecordedVoice, VoiceNoteField } from './voice-note-field';

/** One question at a time: what kind of problem, which system, and what is happening. */
export function NewRequestScreen() {
  const toast = useToast();
  const client = useQueryClient();
  const home = useHome();
  const categories = useServiceCategories().data ?? [];
  // "Ask about an AMC" opens this screen with the question written out.
  const asking = useLocalSearchParams<{ ask?: string }>().ask === 'amc';
  const projects = home.data?.projects ?? [];
  const { project: chosen } = useChosenProject(projects);
  const [category, setCategory] = useState<string | null>(asking ? 'other' : null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState(asking ? COVER.askDescription : '');
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<readonly UploadableFile[]>([]);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [voice, setVoice] = useState<RecordedVoice | null>(null);
  const [recording, setRecording] = useState(false);
  const [checked, setChecked] = useState<{
    category?: string | undefined;
    description?: string | undefined;
  }>({});
  const forProject = projectId ?? chosen?.id ?? null;
  // Typing is optional with a voice note: the customer may just say it (PRD 5.5).
  const typed = description.trim().length >= 5;
  const words = typed || !voice ? description : REQUEST_MEDIA.spokenDescription;

  const send = useMutation({
    mutationFn: async () => {
      const request = await unwrap(
        api.customer.createServiceRequest({
          body: { category: category ?? 'other', projectId: forProject, description: words },
        }),
      );
      const failedPhotos = await sendRequestPhotos(request.id, photos);
      // The video and the voice note go after the photos, to the route that takes them;
      // one at a time, so the customer hears which of them did not get through.
      const videoFailed = video
        ? (await sendRequestPhotos(request.id, [video.file], 'files')) > 0
        : false;
      const voiceFailed = voice
        ? (await sendRequestPhotos(request.id, [voice.file], 'files')) > 0
        : false;
      return { failedPhotos, videoFailed, voiceFailed };
    },
    onMutate: () => setError(null),
    onSuccess: async ({ failedPhotos, videoFailed, voiceFailed }) => {
      await client.invalidateQueries({ queryKey: keys.service });
      const missing = [
        failedPhotos > 0 ? SUPPORT.photoCount(failedPhotos) : null,
        videoFailed ? REQUEST_MEDIA.failedVideo : null,
        voiceFailed ? REQUEST_MEDIA.failedVoice : null,
      ].filter((part) => part !== null);
      toast(
        videoFailed || voiceFailed
          ? REQUEST_MEDIA.notUploaded(missing.join(', '))
          : failedPhotos > 0
            ? SUPPORT.photosFailed(failedPhotos)
            : SUPPORT.sent,
      );
      setCategory(null);
      setDescription('');
      setPhotos([]);
      setVideo(null);
      setVoice(null);
      setError(null);
      router.back();
    },
    onError: (failure) => setError(describeError(failure)),
  });
  const fieldErrors = send.error ? fieldErrorsOf(send.error) : {};
  const categoryError = checked.category ?? fieldErrors.category;
  const descriptionError = checked.description ?? fieldErrors.description;
  const submit = () => {
    const found = {
      ...(category ? {} : { category: SUPPORT.categoryNeeded }),
      ...(typed || voice ? {} : { description: SUPPORT.descriptionNeeded }),
    };
    setChecked(found);
    if (found.category || found.description) {
      send.reset();
      setError(null);
      return;
    }
    send.mutate();
  };
  const addPhotos = async (source: 'camera' | 'library') => {
    const picked = await pickRequestPhotos(source, MAX_REQUEST_PHOTOS - photos.length);
    if (picked === 'denied') {
      setError(source === 'camera' ? SUPPORT.cameraDenied : SUPPORT.libraryDenied);
      return;
    }
    // The same photo picked twice is kept once.
    setPhotos((current) =>
      [
        ...current,
        ...picked.filter((photo) => !current.some((had) => had.uri === photo.uri)),
      ].slice(0, MAX_REQUEST_PHOTOS),
    );
  };

  return (
    <Screen
      footer={
        <Button
          label={SUPPORT.submit}
          onPress={submit}
          pending={send.isPending}
          disabled={recording}
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
          choices={categories.map((item) => ({
            value: item.key,
            label: SUPPORT.category(item.key, item.label),
          }))}
          value={category}
          onChange={(value) => {
            setCategory(value);
            setChecked((current) => ({ ...current, category: undefined }));
          }}
        />
        <FieldError message={categoryError} />
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
        <FieldError message={fieldErrors.projectId} />
        <Field
          label={SUPPORT.descriptionLabel}
          hint={SUPPORT.descriptionHint}
          error={descriptionError}
        >
          <Input
            value={description}
            accessibilityLabel={SUPPORT.descriptionLabel}
            onChangeText={(value) => {
              setDescription(value);
              if (checked.description)
                setChecked((current) => ({ ...current, description: undefined }));
            }}
            multiline
            numberOfLines={4}
            maxLength={2000}
            style={styles.multiline}
            invalid={Boolean(descriptionError)}
          />
        </Field>
        <PhotoStrip
          photos={photos}
          onAdd={(source) => void addPhotos(source)}
          onRemove={(index) => setPhotos((current) => current.filter((_, at) => at !== index))}
        />
        <VoiceNoteField value={voice} onChange={setVoice} onRecording={setRecording} />
        <VideoField value={video} onChange={setVideo} />
        <FormAlert message={error} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  multiline: { minHeight: 104, textAlignVertical: 'top', paddingTop: 12 },
});
