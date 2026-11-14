import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import type { Request } from 'express';

export interface ResolvedClientIp {
  ip: string;
  /** True when the request proved it came through our Vercel proxy (secret matched). */
  viaTrustedProxy: boolean;
}

function secretMatches(given: string | undefined, secret: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The client IP for rate limiting.
 *
 * Web requests reach the API through Vercel's /api proxy, so req.ip is Vercel's egress IP.
 * Vercel overwrites any client-sent X-Forwarded-For and puts the real client first, and it
 * adds `x-proxy-secret` (apps/web/vercel.json). Only when that secret matches is the first
 * X-Forwarded-For entry trusted; anyone calling the API directly can't forge it and keeps
 * the hop-based req.ip (TRUST_PROXY_HOPS).
 */
export function resolveClientIp(req: Request, secret: string | undefined): ResolvedClientIp {
  const fallback = { ip: req.ip ?? req.socket.remoteAddress ?? '', viaTrustedProxy: false };
  if (!secret || !secretMatches(req.get('x-proxy-secret'), secret)) return fallback;
  const first = req.get('x-forwarded-for')?.split(',')[0]?.trim();
  return first && isIP(first) ? { ip: first, viaTrustedProxy: true } : fallback;
}
