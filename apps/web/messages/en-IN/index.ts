import commandCenter from './command-center.json';
import common from './common.json';
import signIn from './sign-in.json';

/**
 * English (India) messages, one file per feature so screens can grow independently.
 * Add a feature's file here; keys must not clash between files.
 */
const messages = { ...common, ...signIn, ...commandCenter };
export default messages;
