import { runId } from './targets';

let counter = 0;

/** A short unique suffix: run id + worker + counter, e.g. gh123-1-w0-3. */
export function uniqueTag(label = 't'): string {
  const worker = process.env.TEST_WORKER_INDEX ?? 'm';
  return `${label}-${runId}-w${worker}-${++counter}`.toLowerCase();
}

/** Usernames allow 3-32 of [a-z0-9_.-]; keep the random tail so retries never collide. */
export function newCredentials(label: string) {
  const rand = Math.random().toString(36).slice(2, 6);
  const username = `e2e-${runId}-${label}-${rand}`
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(-32)
    .replace(/^[^a-z0-9]+/, '');
  return {
    username,
    email: `${username}@example.test`,
    password: `pw-${Math.random().toString(36).slice(2)}-E2e!`,
  };
}

/** The smallest bytes the API's content sniffing accepts as PNG / PDF. */
export const files = {
  png: () => ({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      // A real 1×1 PNG, so the browser can also render the preview.
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    ),
  }),
  pdf: () => ({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%e2e test pdf\n%%EOF\n'),
  }),
  /** HTML pretending to be a PNG: rejected because the type comes from the bytes. */
  disguisedHtml: () => ({
    name: 'receipt.png',
    mimeType: 'image/png',
    buffer: Buffer.from('<html><script>alert(1)</script></html>'),
  }),
};

/** Today in the given time zone as YYYY-MM-DD. */
export function isoDate(date = new Date(), timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
