/**
 * English (India) copy for capturing in the field: notes spoken instead of typed
 * (PRD 4.4), the site's DISCOM (PRD 4.2) and papers for a lead (PRD 4.5).
 */
export const DICTATE = {
  start: 'Speak the note instead of typing',
  stop: 'Stop listening',
  listening: 'Listening. Tap the microphone when you are done.',
  denied: 'Allow the microphone and speech recognition in your phone settings to speak notes.',
  noSpeech: 'Nothing was heard. Tap the microphone and speak again.',
  offline: 'Speaking a note needs signal here. Type it instead.',
  failed: 'That did not work. Try again, or type the note.',
} as const;

export const DISCOM = {
  label: 'DISCOM',
  hint: 'The electricity company named on the bill.',
  confirm: (code: string) => `Confirm ${code}`,
  confirmed: 'Saved on the site.',
  saved: 'DISCOM saved',
  notSet: 'Not noted yet',
  loadError: 'The DISCOM list could not load.',
} as const;

export const LEAD_CONNECTION = {
  title: 'Site',
  edit: 'Edit',
  editLabel: 'Edit the consumer number and DISCOM',
  consumerNumber: 'Consumer number',
  discom: 'DISCOM',
  notSet: 'Not noted yet',
  sheetTitle: 'Electricity connection',
  sheetDescription:
    'From the electricity bill. Both can wait for the survey if the bill is not at hand.',
  consumerHint: 'Printed on the electricity bill.',
  save: 'Save',
  saved: 'Electricity details saved',
  loadError: 'The site could not load.',
} as const;

export const LEAD_PAPERS = {
  title: 'Documents and bills',
  add: 'Add document or bill',
  empty: 'Nothing yet. Add the electricity bill, ID proof or property papers.',
  loadError: 'The documents could not load.',
  sheetTitle: 'Add a document',
  sheetDescription: 'Kept with the customer’s site. It uploads by itself when there is signal.',
  kind: 'What is it?',
  categories: {
    electricity_bill: 'Electricity bill',
    customer_kyc: 'ID proof',
    property: 'Property paper',
    other: 'Other',
  },
  takePhoto: 'Take photo',
  choosePhoto: 'Choose photo',
  chooseFile: 'Choose file',
  chooseFileHint: 'A PDF or a picture already on this phone',
  added: (count: number) =>
    count === 1
      ? 'Added. It uploads by itself when there is signal.'
      : `${count} added. They upload by themselves when there is signal.`,
  cameraDenied: 'Allow camera access in your phone settings to photograph papers.',
  libraryDenied: 'Allow photo access in your phone settings to attach papers.',
  tooLarge: (names: string) => `Over the 25 MB limit, not added: ${names}.`,
  addedOn: (category: string, date: string) => `${category} · ${date}`,
  otherCategory: 'Document',
} as const;
