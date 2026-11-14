import { config } from 'dotenv';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

/** E2E tests always run against a separate database: <name>_test. */
export function loadTestEnv() {
  config({ path: resolve(__dirname, '../.env'), quiet: true });
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
  process.env.DATABASE_URL = url.toString();
  // Make sure test migrations never follow a DIRECT_DATABASE_URL to a real database.
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.GOOGLE_CLIENT_IDS = 'test-google-client-id';
  process.env.STORAGE_DIR = join(tmpdir(), 'myfinances-test-storage');
  process.env.PROXY_SECRET = 'test-proxy-secret-0123456789abcdefghij';
}

loadTestEnv();
