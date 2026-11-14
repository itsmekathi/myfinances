import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import type { Env } from '../config/env';
import { resolveClientIp } from './client-ip';

/** ThrottlerGuard that tracks the real client behind our Vercel proxy (see resolveClientIp). */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly proxySecret: string | undefined;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService<Env, true>,
  ) {
    super(options, storage, reflector);
    this.proxySecret = config.get('PROXY_SECRET', { infer: true });
  }

  protected override async getTracker(req: Record<string, any>): Promise<string> {
    // The base class only reads `ip`, and normalises IPv6 to a subnet.
    return super.getTracker({ ip: resolveClientIp(req as Request, this.proxySecret).ip });
  }
}
