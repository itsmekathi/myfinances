import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver';

/**
 * Stores files on local disk. Used in development and the e2e tests. On hosts with
 * an ephemeral filesystem (Render free tier), files vanish on every deploy.
 */
export class LocalStorageDriver implements StorageDriver {
  private readonly root: string;

  constructor(dir: string) {
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  async put(key: string, data: Buffer): Promise<void> {
    await writeFile(join(this.root, key), data, { flag: 'wx' });
  }

  async open(key: string): Promise<Readable | null> {
    const path = join(this.root, key);
    try {
      await stat(path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    return createReadStream(path);
  }

  async remove(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => rm(join(this.root, k), { force: true })));
  }
}
