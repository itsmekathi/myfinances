import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Env } from '../config/env';
import { LocalStorageDriver } from './local-storage.driver';
import { S3StorageDriver } from './s3-storage.driver';
import { assertStorageKey, type StorageDriver } from './storage-driver';

/**
 * Stores attachment bytes under random UUID keys, never user-supplied names, so keys
 * can't be manipulated. STORAGE_DRIVER picks local disk (default) or an S3-compatible
 * bucket such as Cloudflare R2.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  readonly driver: StorageDriver;

  constructor(config: ConfigService<Env, true>) {
    this.driver =
      config.get('STORAGE_DRIVER', { infer: true }) === 's3'
        ? S3StorageDriver.create({
            // validateEnv guarantees these are set when STORAGE_DRIVER=s3.
            endpoint: config.get('S3_ENDPOINT', { infer: true })!,
            region: config.get('S3_REGION', { infer: true }),
            bucket: config.get('S3_BUCKET', { infer: true })!,
            accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true })!,
            secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true })!,
          })
        : new LocalStorageDriver(config.get('STORAGE_DIR', { infer: true }));
  }

  async onModuleInit() {
    if (this.driver instanceof LocalStorageDriver) await this.driver.init();
  }

  async save(data: Buffer, contentType: string): Promise<string> {
    const key = randomUUID();
    await this.driver.put(key, data, contentType);
    return key;
  }

  /** Opens a stored file, or returns null if it's missing (e.g. lost from an old disk). */
  async open(key: string): Promise<Readable | null> {
    assertStorageKey(key);
    return this.driver.open(key);
  }

  async remove(key: string): Promise<void> {
    await this.removeMany([key]);
  }

  async removeMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    keys.forEach(assertStorageKey);
    await this.driver.remove(keys);
  }
}
