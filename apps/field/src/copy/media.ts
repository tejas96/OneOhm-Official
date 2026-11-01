/** English (India) copy for voice notes and short videos as evidence (PRD 4.2). */
const clock = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export const MEDIA = {
  clock,
  video: 'Video',
  voiceNote: 'Voice note',
  videoSheet: {
    title: 'Add a short video',
    body: (seconds: number) =>
      `Up to ${seconds} seconds. Videos keep where they were taken, like photos.`,
    record: 'Record a video',
    recordHint: 'Opens the camera',
    choose: 'Choose from gallery',
    chooseHint: 'A video already on this phone',
  },
  videoTooLong: (seconds: number) => `Choose a video of ${seconds} seconds or less.`,
  videoTooLarge: (limit: string) => `This video is over ${limit}. Record a shorter one.`,
  cameraDenied: 'Allow camera access in your phone settings to record site videos.',
  libraryDenied: 'Allow photo access in your phone settings to attach site videos.',
  voice: {
    title: 'Voice note',
    body: (seconds: number) =>
      `Say what you saw or did. Up to ${Math.round(seconds / 60)} minutes.`,
    start: 'Tap to record, or hold and let go',
    startLabel: 'Start recording',
    stopLabel: 'Stop recording',
    recording: 'Recording. Tap to stop.',
    limit: (max: number) => `of ${clock(max)}`,
    play: 'Play',
    pause: 'Pause',
    again: 'Record again',
    save: 'Save voice note',
    saved: 'Voice note saved. It uploads when there is signal.',
    denied: 'Allow the microphone in your phone settings to record voice notes.',
    failed: 'The recording could not start. Try again.',
    fileName: (stamp: string) => `Voice note ${stamp}`,
  },
  tile: {
    voice: 'Voice note',
    video: 'Video',
    playVoice: (name: string) => `Play voice note ${name}`,
    pauseVoice: (name: string) => `Pause voice note ${name}`,
    openVideo: (name: string) => `Play video ${name}`,
    loadFailed: 'This could not play.',
  },
} as const;
