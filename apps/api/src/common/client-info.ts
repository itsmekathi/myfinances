import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import Bowser from 'bowser';
import type { Request } from 'express';
import type { ClientInfoDto } from '@myfinances/shared';

const clip = (v: string | undefined, max: number) => (v ? v.slice(0, max) : null);

/** Works out where a request came from: browser/OS from User-Agent, plus headers the mobile app sends. */
export function parseClientInfo(req: Request): ClientInfoDto {
  const ua = req.get('user-agent') ?? '';
  const parsed = ua ? Bowser.parse(ua) : undefined;
  const platform = req.get('x-client-platform')?.toLowerCase();
  const isMobileApp = req.get('x-client-type') === 'mobile';

  let type: ClientInfoDto['type'] = 'unknown';
  if (isMobileApp) type = platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'unknown';
  else if (ua) type = 'web';

  return {
    type,
    browser: isMobileApp ? null : clip(parsed?.browser.name, 50),
    browserVersion: isMobileApp ? null : clip(parsed?.browser.version, 30),
    os: clip(parsed?.os.name, 50),
    device: clip(parsed?.platform.type, 30),
    appVersion: isMobileApp ? clip(req.get('x-app-version'), 30) : null,
    userAgent: clip(ua, 300),
  };
}

export const ClientInfo = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfoDto =>
  parseClientInfo(ctx.switchToHttp().getRequest<Request>()),
);
