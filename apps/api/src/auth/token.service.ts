import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Start a new session (new token family). */
  issue(userId: string, userAgent?: string): Promise<IssuedTokens> {
    return this.createPair(userId, randomUUID(), userAgent);
  }

  /**
   * Exchange a refresh token for a new pair (rotation).
   * Presenting an already-used token again revokes the whole family,
   * because that means the token was probably stolen.
   */
  async rotate(
    refreshToken: string,
    userAgent?: string,
  ): Promise<IssuedTokens & { userId: string }> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!existing) throw new UnauthorizedException('Invalid refresh token');

    if (existing.revokedAt) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (existing.expiresAt <= new Date()) throw new UnauthorizedException('Refresh token expired');

    // Claim the token atomically so two parallel refreshes cannot both succeed.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (claimed.count === 0) {
      await this.revokeFamily(existing.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const pair = await this.createPair(existing.userId, existing.familyId, userAgent);
    return { ...pair, userId: existing.userId };
  }

  async revoke(refreshToken: string): Promise<void> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (existing) await this.revokeFamily(existing.familyId);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createPair(
    userId: string,
    familyId: string,
    userAgent?: string,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    const refreshExpiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: userAgent?.slice(0, 255),
      },
    });

    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' });
    return { accessToken, refreshToken, refreshExpiresAt };
  }
}
