import { StandardSchemaValidationPipe, type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import type { Env } from './config/env';

/** Shared by main.ts and the e2e tests so both run the same app configuration. */
export function configureApp(app: INestApplication) {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  applyTrustProxy(app, config.get('TRUST_PROXY_HOPS', { infer: true }));
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }).split(','),
    credentials: true,
  });
  app.enableShutdownHooks();
}

/**
 * Sets Express "trust proxy" to a hop count, so req.ip (which the throttler tracks)
 * is the address the outermost trusted proxy saw. A number, never `true`: `true`
 * trusts the left-most X-Forwarded-For entry, which any client can forge.
 */
export function applyTrustProxy(app: INestApplication, hops: number) {
  (app as NestExpressApplication).set('trust proxy', hops > 0 ? hops : false);
}
