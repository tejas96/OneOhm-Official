/** Evidence kept on the phone until it reaches OneOhm (PRD 4.1, 4.4). */
export const UPLOADS = {
  waiting: (count: number) => `Waiting to upload (${count})`,
  waitingShort: (count: number) => `${count} waiting to upload`,
  body: 'Saved on this phone. They upload by themselves when there is signal.',
  needsYou: (count: number) =>
    `${count} could not upload. Open the task or lead to retry or remove ${count === 1 ? 'it' : 'them'}.`,
  openTask: 'Open the task or lead with files waiting to upload',
  missingFile: 'This file is no longer on the phone. Remove it and add it again.',
  holdComplete: 'You can complete the task once these have uploaded.',
} as const;
