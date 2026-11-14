/** Which deployment the suites run against: E2E_TARGET=local | staging | production. */
export type TargetName = 'local' | 'staging' | 'production';

export interface Target {
  name: TargetName;
  /** The web app's origin. The UI suite runs here; its /api proxies to the API. */
  webURL: string;
  /** The API's origin, without /api. The API suite calls it directly. */
  apiURL: string;
  remote: boolean;
}

const DEFAULTS: Record<TargetName, { webURL: string; apiURL: string }> = {
  local: { webURL: 'http://localhost:5173', apiURL: 'http://localhost:3000' },
  staging: {
    webURL: 'https://myfinances-gamma-staging.vercel.app',
    apiURL: 'https://myfinances-api-staging.onrender.com',
  },
  production: {
    webURL: 'https://myfinances-gamma.vercel.app',
    apiURL: 'https://myfinances-api-0km5.onrender.com',
  },
};

const trim = (url: string) => url.replace(/\/+$/, '');

export function resolveTarget(env: NodeJS.ProcessEnv = process.env): Target {
  const name = (env.E2E_TARGET || 'local').toLowerCase() as TargetName;
  if (!(name in DEFAULTS)) {
    throw new Error(`E2E_TARGET must be local, staging or production (got "${env.E2E_TARGET}")`);
  }
  return {
    name,
    webURL: trim(env.E2E_WEB_URL || DEFAULTS[name].webURL),
    apiURL: trim(env.E2E_API_URL || DEFAULTS[name].apiURL),
    remote: name !== 'local',
  };
}

/** Identifies this run in test data (emails, names, notes), so leftovers are traceable. */
export const runId =
  process.env.E2E_RUN_ID ??
  (process.env.GITHUB_RUN_ID
    ? `gh${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
    : `l${Date.now().toString(36)}`);
// Workers inherit the main process's env, so every worker shares the same id.
process.env.E2E_RUN_ID = runId;
