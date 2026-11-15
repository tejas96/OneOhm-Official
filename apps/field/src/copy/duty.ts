/** English (India) copy for the duty route in the field app (Duty Day step 1). */
export const DUTY = {
  routeOn: 'Route on',
  routeForeground: 'Route on (only while app is open)',
  routeFix: 'Route off: location permission needed',
  waiting: (count: number) => `${count} ${count === 1 ? 'point' : 'points'} waiting to upload`,
  sheetTitle: 'Record your route in the background',
  sheetBody:
    'On the next screen, choose "Allow all the time". OneOhm records your route only while you are on duty, and stops when you end duty. It keeps recording in the background; if you force-close the app on iPhone, it stops until you open it again. If you do not allow it, the route is recorded only while the app is open.',
  sheetContinue: 'Continue',
  sheetLater: 'Not now',
  sheetClose: 'Close',
  batteryTitle: 'Keep OneOhm running on this phone',
  batteryBody:
    'Some phones close apps in the background to save battery. Open settings, find Battery for OneOhm and choose "No restrictions" or "Allow background activity".',
  batteryOpen: 'Open settings',
  batteryDone: 'Got it',
} as const;
