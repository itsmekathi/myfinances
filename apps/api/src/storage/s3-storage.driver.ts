import {
  DeleteObjectsCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { StorageDriver } from './storage-driver';

export interface S3StorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** S3's DeleteObjects limit per request. */
const DELETE_BATCH = 1000;

/**
 * Stores files in an S3-compatible bucket (Cloudflare R2 in production). The bucket
 * stays private: downloads are streamed through the API, which checks access first.
 */
export class S3StorageDriver implements StorageDriver {
  constructor(
    private readonly bucket: string,
    private readonly client: Pick<S3Client, 'send'>,
  ) {}

  static create(opts: S3StorageOptions): S3StorageDriver {
    const client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      // R2 and other S3-compatible stores expect bucket-in-path URLs.
      forcePathStyle: true,
      // Only send/validate checksums where S3 requires them; S3-compatible stores
      // have lagged behind the SDK's newer default checksum headers.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return new S3StorageDriver(opts.bucket, client);
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async open(key: string): Promise<Readable | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return (res.Body as Readable | undefined) ?? null;
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      if (e instanceof S3ServiceException && e.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }

  async remove(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH) {
      const batch = keys.slice(i, i + DELETE_BATCH);
      const res = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
      // Missing keys aren't errors in S3; anything reported here is a real failure.
      if (res.Errors?.length) {
        const first = res.Errors[0];
        throw new Error(`Failed to delete ${res.Errors.length} object(s): ${first.Code} ${first.Message ?? ''}`.trim());
      }
    }
  }
}
