import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Written by `pnpm --filter @oneohm/worker bundle` (see bundle-workflows.ts). */
export const WORKFLOW_BUNDLE_PATH = join(__dirname, 'workflow-bundle.js');
export const WORKFLOWS_PATH = require.resolve('./workflows');

/**
 * Production loads the prebuilt bundle so every replica runs identical workflow code
 * and starts without webpack; development bundles at start so edits are never stale.
 */
export function workflowSource(
  nodeEnv: string,
): { workflowBundle: { codePath: string } } | { workflowsPath: string } {
  if (nodeEnv === 'production' && existsSync(WORKFLOW_BUNDLE_PATH)) {
    return { workflowBundle: { codePath: WORKFLOW_BUNDLE_PATH } };
  }
  return { workflowsPath: WORKFLOWS_PATH };
}
