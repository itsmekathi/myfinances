import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PrismaService as PrismaServiceType } from '../src/prisma/prisma.service';
import { validateEnv } from '../src/config/env';

/**
 * Runs the attachment endpoints with STORAGE_DRIVER=s3 against a minimal in-process
 * S3-compatible server, so the real AWS SDK requests (path-style URLs, DeleteObjects
 * XML, 404s) are exercised the way R2 will see them.
 */

type StoredObject = { body: Buffer; contentType: string | undefined };

function startFakeS3(bucket: string) {
  const objects = new Map<string, StoredObject>();
  const requests: { method: string; path: string; query: string[]; signed: boolean }[] = [];

  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });

  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    const [, reqBucket, ...rest] = url.pathname.split('/');
    const key = decodeURIComponent(rest.join('/'));
    const body = await readBody(req);
    requests.push({
      method: req.method!,
      path: url.pathname.replace(/\/$/, ''),
      query: [...url.searchParams.keys()],
      signed: String(req.headers.authorization ?? '').startsWith('AWS4-HMAC-SHA256'),
    });

    if (reqBucket !== bucket) {
      res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchBucket</Code></Error>');
      return;
    }
    if (req.method === 'PUT' && key) {
      objects.set(key, { body, contentType: req.headers['content-type'] });
      res.writeHead(200, { ETag: '"etag"' }).end();
      return;
    }
    if (req.method === 'GET' && key) {
      const obj = objects.get(key);
      if (!obj) {
        res
          .writeHead(404, { 'Content-Type': 'application/xml' })
          .end(`<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Key>${key}</Key></Error>`);
        return;
      }
      res.writeHead(200, { 'Content-Type': obj.contentType ?? 'application/octet-stream', 'Content-Length': obj.body.length });
      res.end(obj.body);
      return;
    }
    if (req.method === 'POST' && url.searchParams.has('delete')) {
      for (const m of body.toString().matchAll(/<Key>([^<]+)<\/Key>/g)) objects.delete(m[1]);
      res
        .writeHead(200, { 'Content-Type': 'application/xml' })
        .end('<?xml version="1.0" encoding="UTF-8"?><DeleteResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"></DeleteResult>');
      return;
    }
    res.writeHead(400).end();
  });

  return new Promise<{ server: Server; endpoint: string; objects: typeof objects; requests: typeof requests }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, endpoint: `http://127.0.0.1:${port}`, objects, requests });
    });
  });
}

describe('attachments on S3-compatible storage (e2e)', () => {
  const BUCKET = 'test-attachments';
  const S3_ENV = ['STORAGE_DRIVER', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'];
  const savedEnv: Record<string, string | undefined> = {};

  let s3: Awaited<ReturnType<typeof startFakeS3>>;
  let app: INestApplication;
  let prisma: PrismaServiceType;
  const api = () => request(app.getHttpServer());

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
  const pdf = Buffer.from('%PDF-1.4\n%fake test pdf\n%%EOF\n');
  const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  async function withExpense() {
    const reg = await api()
      .post('/api/auth/register')
      .set('x-client-type', 'mobile')
      .send({ email: 'sam@example.com', username: 'sam', password: 'correct-horse-1' })
      .expect(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    const me = await api().get('/api/me').set(auth).expect(200);
    const base = `/api/workspaces/${me.body.workspaces[0].id}`;
    const exp = await api().post(`${base}/expenses`).set(auth).send({ amountMinor: 100, date: '2026-11-14' }).expect(201);
    return { auth, base, expenseId: exp.body.id as string, url: `${base}/expenses/${exp.body.id}/attachments` };
  }

  beforeAll(async () => {
    s3 = await startFakeS3(BUCKET);
    for (const k of S3_ENV) savedEnv[k] = process.env[k];
    Object.assign(process.env, {
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: s3.endpoint,
      S3_REGION: 'auto',
      S3_BUCKET: BUCKET,
      S3_ACCESS_KEY_ID: 'test-key-id',
      S3_SECRET_ACCESS_KEY: 'test-secret',
    });

    // Loaded after setting the env: ConfigModule reads it when AppModule loads.
    /* eslint-disable @typescript-eslint/no-require-imports */
    const { AppModule } = require('../src/app.module') as typeof import('../src/app.module');
    const { configureApp } = require('../src/setup') as typeof import('../src/setup');
    const { PrismaService } = require('../src/prisma/prisma.service') as typeof import('../src/prisma/prisma.service');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    s3.objects.clear();
    s3.requests.length = 0;
    await prisma.$executeRawUnsafe(
      'TRUNCATE "Attachment", "ExpenseItem", "Expense", "Category", "WorkspaceMember", "Workspace", "RefreshToken", "AuthIdentity", "User" CASCADE',
    );
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((r) => s3?.server.close(r));
    for (const k of S3_ENV) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('stores uploads in the bucket, streams them back, and deletes them', async () => {
    const s = await withExpense();
    const up = await api().post(s.url).set(s.auth).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);

    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: up.body.id } });
    const stored = s3.objects.get(att.storageKey);
    expect(stored?.contentType).toBe('image/png');
    expect(Buffer.compare(stored!.body, png)).toBe(0);
    expect(s3.requests[0]).toMatchObject({ method: 'PUT', path: `/${BUCKET}/${att.storageKey}`, signed: true });

    const dl = await api().get(`${s.url}/${up.body.id}`).set(s.auth).buffer(true).parse(binary).expect(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(dl.body as Buffer, png)).toBe(0);

    await api().delete(`${s.url}/${up.body.id}`).set(s.auth).expect(204);
    expect(s3.objects.has(att.storageKey)).toBe(false);
    await api().get(`${s.url}/${up.body.id}`).set(s.auth).expect(404);
  });

  it('deletes all of an expense\'s files from the bucket when the expense is deleted', async () => {
    const s = await withExpense();
    await api().post(s.url).set(s.auth).attach('file', png, { filename: 'a.png', contentType: 'image/png' }).expect(201);
    await api().post(s.url).set(s.auth).attach('file', pdf, { filename: 'b.pdf', contentType: 'application/pdf' }).expect(201);
    expect(s3.objects.size).toBe(2);

    await api().delete(`${s.base}/expenses/${s.expenseId}`).set(s.auth).expect(204);
    expect(s3.objects.size).toBe(0);
    expect(s3.requests.at(-1)).toMatchObject({ method: 'POST', path: `/${BUCKET}`, query: ['delete'] });
  });

  it('returns 404 when the record exists but the file is gone from the bucket', async () => {
    const s = await withExpense();
    const up = await api().post(s.url).set(s.auth).attach('file', png, { filename: 'bill.png', contentType: 'image/png' }).expect(201);
    s3.objects.clear();

    const res = await api().get(`${s.url}/${up.body.id}`).set(s.auth).expect(404);
    expect(res.body.message).toBe('Attachment file is missing');
  });

  it('refuses to start with STORAGE_DRIVER=s3 and missing S3 settings', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: 'postgresql://x', JWT_ACCESS_SECRET: 'x'.repeat(32), STORAGE_DRIVER: 's3', S3_BUCKET: 'b' }),
    ).toThrow(/S3_ENDPOINT: required when STORAGE_DRIVER=s3[\s\S]*S3_ACCESS_KEY_ID[\s\S]*S3_SECRET_ACCESS_KEY/);
  });
});
