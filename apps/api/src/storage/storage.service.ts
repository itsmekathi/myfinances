import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, resolve } from 'node:path';
import type { Env } from '../config/env';

/**
 * Stores uploaded files on local disk. Keys are random UUIDs, never user-supplied names,
 * so paths can't be manipulated. Swap this class for an S3 implementation later.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    const dir = config.get('STORAGE_DIR', { infer: true });
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  async onModuleInit() {
    await mkdir(this.root, { recursive: true });
  }

  async save(data: Buffer): Promise<string> {
    const key = randomUUID();
    await writeFile(this.pathFor(key), data, { flag: 'wx' });
    return key;
  }

  stream(key: string): ReadStream {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async removeMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map((k) => this.remove(k)));
  }

  private pathFor(key: string) {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error('Invalid storage key');
    return join(this.root, key);
  }
}
