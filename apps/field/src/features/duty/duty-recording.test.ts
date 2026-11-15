import { beforeEach, describe, expect, it, vi } from 'vitest';

const watchers: { remove: ReturnType<typeof vi.fn> }[] = [];
const watchPositionAsync = vi.fn(async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  const subscription = { remove: vi.fn() };
  watchers.push(subscription);
  return subscription;
});

vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  watchPositionAsync: (...args: unknown[]) => watchPositionAsync(...(args as [])),
  getForegroundPermissionsAsync: async () => ({ granted: true }),
  getBackgroundPermissionsAsync: async () => ({ granted: false }),
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: {} }));
vi.mock('./duty-background', () => ({
  startBackground: async () => undefined,
  stopBackground: async () => undefined,
}));
vi.mock('./duty-record', () => ({ recordLocations: async () => null }));
vi.mock('./duty-store', () => ({ writePrefs: async () => undefined }));

const { startRecording, stopRecording } = await import('./duty-recording');

describe('starting the foreground recording', () => {
  beforeEach(async () => {
    await stopRecording();
    watchers.length = 0;
    watchPositionAsync.mockClear();
  });

  it('shares one start between concurrent calls, so only one watch is opened', async () => {
    const modes = await Promise.all([
      startRecording('u1'),
      startRecording('u1'),
      startRecording('u1'),
    ]);
    expect(modes).toEqual(['foreground', 'foreground', 'foreground']);
    expect(watchPositionAsync).toHaveBeenCalledTimes(1);
  });

  it('closes a watch that finished opening after a stop', async () => {
    const started = startRecording('u1');
    // Stop while the watch is still opening.
    await vi.waitFor(() => expect(watchPositionAsync).toHaveBeenCalled());
    await stopRecording();
    await started;
    expect(watchers).toHaveLength(1);
    expect(watchers[0]?.remove).toHaveBeenCalled();
  });

  it('starts again after a stop (the shared start is cleared)', async () => {
    await startRecording('u1');
    await stopRecording();
    await startRecording('u1');
    expect(watchPositionAsync).toHaveBeenCalledTimes(2);
  });
});
