import { type Environment, loadEnvironment } from './environment';

let loaded: Environment | null = null;

/**
 * The settings for plain functions that run inside another service's transaction (task
 * messages, milestone notices) and so cannot have them injected. Read once, then reused.
 */
export function environmentOnce(): Environment {
  loaded ??= loadEnvironment();
  return loaded;
}
