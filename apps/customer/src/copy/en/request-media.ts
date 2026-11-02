/** Copy for a help request's voice note and short video (PRD 5.5). */
export const REQUEST_MEDIA = {
  voiceLabel: 'Voice note',
  voiceHint: (minutes: number) =>
    `Optional. Say what is happening instead of typing, up to ${minutes} minutes.`,
  record: 'Record a voice note',
  stop: 'Stop recording',
  recording: 'Recording. Tap stop when you are done.',
  play: 'Play voice note',
  pause: 'Pause voice note',
  removeVoice: 'Remove voice note',
  micDenied: 'To record, allow the microphone for OneOhm in your phone settings.',
  recordFailed: 'The recording did not start. Please try again.',
  voiceOnWeb: 'You can record a voice note in the OneOhm app on your phone.',
  videoLabel: 'Short video',
  videoHint: (seconds: number) =>
    `Optional. Up to ${seconds} seconds, for a sound or a blinking light.`,
  recordVideo: 'Record video',
  chooseVideo: 'Choose video',
  removeVideo: 'Remove video',
  videoReady: 'Video added',
  videoTooLong: (seconds: number) =>
    `This video is longer than ${seconds} seconds. Please pick a shorter one.`,
  videoTooLarge: 'This video is too large. Please record a shorter one.',
  /** After a request is raised: what did not upload, e.g. "2 photos, the video". */
  notUploaded: (what: string) =>
    `Sent. These could not be uploaded: ${what}. Please show them to the team when they call.`,
  failedVideo: 'the video',
  failedVoice: 'the voice note',
  hasVideo: 'Video',
  hasVoiceNote: 'Voice note',
  visitOn: (date: string) => `Technician visit on ${date}`,
  /** Sent as the request's words when the customer only spoke. */
  spokenDescription: 'Explained in a voice note.',
} as const;
