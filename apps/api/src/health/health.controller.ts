import { Controller, Get, Req, ServiceUnavailableException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'up' };
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
  }

  /**
   * Shows how the proxy chain reaches the API, to pick TRUST_PROXY_HOPS: `ip` is
   * what the rate limiter uses. Only echoes the caller's own request.
   */
  @Get('client-ip')
  clientIp(@Req() req: Request) {
    const header = (name: string) => req.get(name) ?? null;
    return {
      ip: req.ip,
      socket: req.socket.remoteAddress ?? null,
      forwardedFor: header('x-forwarded-for'),
      cfConnectingIp: header('cf-connecting-ip'),
      trueClientIp: header('true-client-ip'),
      realIp: header('x-real-ip'),
      vercelForwardedFor: header('x-vercel-forwarded-for'),
    };
  }
}
