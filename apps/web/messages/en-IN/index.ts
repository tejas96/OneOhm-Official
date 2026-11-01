import commandCenter from './command-center.json';
import common from './common.json';
import projects from './projects.json';
import signIn from './sign-in.json';
import today from './today.json';

/**
 * English (India) messages, one file per feature so screens can grow independently.
 * Add a feature's file here; keys must not clash between files.
 */
const messages = { ...common, ...signIn, ...commandCenter, ...projects, ...today };
export default messages;
