import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AuthResponse, UserDto } from '@myfinances/shared';
import { ApiClient, expectJson } from './api-client';
import { newCredentials } from './data';
import { resolveTarget } from './targets';

export const MOBILE = { 'X-Client-Type': 'mobile' };
/** Access tokens live 15 minutes; refresh well before that. */
export const TOKEN_MAX_AGE_MS = 10 * 60_000;

export interface AccountData {
  email: string;
  username: string;
  password: string;
  user: UserDto;
  accessToken: string;
  refreshToken: string;
  workspaceId: string;
  /** /api/workspaces/<id> */
  base: string;
  issuedAt: number;
}

type Credentials = Pick<AccountData, 'email' | 'password'>;
type Deletable = Credentials & Partial<Pick<AccountData, 'accessToken' | 'refreshToken' | 'issuedAt'>>;

/**
 * Every account a run creates is recorded here, and global teardown deletes them all, one
 * at a time. Deleting during the run instead would have the workers compete for
 * DELETE /api/me's 5 requests a minute. Entries hold the latest tokens, so teardown rarely
 * needs a login (10/min). One folder per target, so a local leftover is never tried against
 * staging. Gitignored; never uploaded.
 */
const LEDGER_DIR = resolve(__dirname, '..', '.accounts', resolveTarget().name);
const ledgerFile = (email: string) => join(LEDGER_DIR, `${email.replace(/[^a-z0-9@._-]/gi, '_')}.json`);

/** Records (or updates) an account for global teardown to delete. */
export function rememberAccount(account: Deletable): void {
  const { email, password, accessToken, refreshToken, issuedAt } = account;
  mkdirSync(LEDGER_DIR, { recursive: true });
  writeFileSync(ledgerFile(email), JSON.stringify({ email, password, accessToken, refreshToken, issuedAt }));
}

function forgetAccount(email: string): void {
  rmSync(ledgerFile(email), { force: true });
}

export function rememberedAccounts(): Deletable[] {
  let names: string[];
  try {
    names = readdirSync(LEDGER_DIR).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names.flatMap((n) => {
    try {
      return [JSON.parse(readFileSync(join(LEDGER_DIR, n), 'utf8')) as Deletable];
    } catch {
      return [];
    }
  });
}

/** Registers a user (mobile flow, so the refresh token comes back in the body). */
export async function registerAccount(api: ApiClient, label: string): Promise<AccountData> {
  const creds = newCredentials(label);
  rememberAccount(creds);
  const auth = await expectJson<AuthResponse>(await api.as(undefined, MOBILE).post('/api/auth/register', creds), 201);
  const me = await expectJson<{ workspaces: { id: string }[] }>(await api.as(auth.accessToken).get('/api/me'), 200);
  const workspaceId = me.workspaces[0].id;
  const account: AccountData = {
    ...creds,
    user: auth.user,
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken!,
    workspaceId,
    base: `/api/workspaces/${workspaceId}`,
    issuedAt: Date.now(),
  };
  rememberAccount(account);
  return account;
}

/**
 * A usable access token: the stored one, else a refresh (30/min), else a login (10/min).
 * Null when the account no longer exists (e.g. a test deleted it), so no DELETE is spent on it.
 */
async function accessTokenFor(api: ApiClient, account: Deletable): Promise<string | null> {
  if (account.accessToken && account.issuedAt && Date.now() - account.issuedAt < TOKEN_MAX_AGE_MS) {
    const me = await api.as(account.accessToken).get('/api/me');
    if (me.status() === 404) return null; // the token is still signed, but the user is gone
    if (me.ok()) return account.accessToken;
  }
  const mobile = api.as(undefined, MOBILE);
  if (account.refreshToken) {
    const res = await mobile.post('/api/auth/refresh', { refreshToken: account.refreshToken });
    if (res.ok()) return ((await res.json()) as AuthResponse).accessToken;
  }
  const login = await mobile.post('/api/auth/login', { identifier: account.email, password: account.password });
  if (login.status() === 401) return null; // no such account
  return (await expectJson<AuthResponse>(login, 200)).accessToken;
}

/**
 * Deletes the account and everything in it (global teardown calls this for every account). Accounts that are already gone (deleted by
 * the test itself, or never created) count as deleted. Returns false if it's still there.
 */
export async function deleteAccount(api: ApiClient, account: Deletable): Promise<boolean> {
  const token = await accessTokenFor(api, account);
  // Can't sign in: the account doesn't exist (any other failure would have thrown or retried).
  if (!token) {
    forgetAccount(account.email);
    return true;
  }
  const res = await api.as(token).delete('/api/me', { confirmEmail: account.email, password: account.password });
  if ([204, 404].includes(res.status())) {
    forgetAccount(account.email);
    return true;
  }
  console.warn(`[e2e] could not delete ${account.email}: HTTP ${res.status()} ${await res.text()}`);
  return false;
}
