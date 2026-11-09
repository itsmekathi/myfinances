import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { LoginInput, RegisterInput, UserDto } from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { toUserDto } from '../users/users.service';
import { GoogleVerifierService } from './google-verifier.service';
import { TokenService, type IssuedTokens } from './token.service';

export interface SessionResult {
  user: UserDto;
  tokens: IssuedTokens;
}

const withIdentities = { identities: { select: { provider: true } } } as const;

@Injectable()
export class AuthService {
  /** Used so that "unknown user" and "wrong password" take the same time. */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly workspaces: WorkspacesService,
    private readonly tokens: TokenService,
    private readonly google: GoogleVerifierService,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<SessionResult> {
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { email: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.email === input.email ? 'Email is already registered' : 'Username is taken',
      );
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: input.email,
            username: input.username,
            displayName: input.displayName ?? input.username,
            passwordHash,
          },
          include: withIdentities,
        });
        await this.workspaces.createPersonal(tx, created.id, created.displayName ?? created.username!);
        return created;
      });
      return { user: toUserDto(user), tokens: await this.tokens.issue(user.id, userAgent) };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email or username is already registered');
      }
      throw e;
    }
  }

  async login(input: LoginInput, userAgent?: string): Promise<SessionResult> {
    const identifier = input.identifier.toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: identifier.includes('@') ? { email: identifier } : { username: identifier },
      include: withIdentities,
    });

    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const ok = await argon2.verify(hash, input.password).catch(() => false);
    if (!user?.passwordHash || !ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { user: toUserDto(user), tokens: await this.tokens.issue(user.id, userAgent) };
  }

  async loginWithGoogle(idToken: string, userAgent?: string): Promise<SessionResult> {
    const profile = await this.google.verify(idToken);
    if (!profile.emailVerified) throw new UnauthorizedException('Google email is not verified');

    // 1. Already linked
    const identity = await this.prisma.authIdentity.findUnique({
      where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
      include: { user: { include: withIdentities } },
    });
    if (identity) {
      return {
        user: toUserDto(identity.user),
        tokens: await this.tokens.issue(identity.userId, userAgent),
      };
    }

    // 2. Existing account with the same email -> link it
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (existing) {
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.authIdentity.create({
          data: { userId: existing.id, provider: 'google', providerUserId: profile.sub },
        });
        return tx.user.update({
          where: { id: existing.id },
          data: {
            emailVerified: true,
            avatarUrl: existing.avatarUrl ?? profile.picture,
            // We never verified this email ourselves, so whoever set the password may not own it.
            // Google just proved ownership: drop the unverified password to block account pre-hijacking.
            ...(existing.emailVerified ? {} : { passwordHash: null }),
          },
          include: withIdentities,
        });
      });
      if (!existing.emailVerified && existing.passwordHash) {
        await this.tokens.revokeAllForUser(existing.id);
      }
      return { user: toUserDto(user), tokens: await this.tokens.issue(user.id, userAgent) };
    }

    // 3. Brand new user
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: profile.email,
          emailVerified: true,
          displayName: profile.name ?? profile.email.split('@')[0],
          avatarUrl: profile.picture,
          identities: { create: { provider: 'google', providerUserId: profile.sub } },
        },
        include: withIdentities,
      });
      await this.workspaces.createPersonal(tx, created.id, created.displayName!);
      return created;
    });
    return { user: toUserDto(user), tokens: await this.tokens.issue(user.id, userAgent) };
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<SessionResult> {
    const rotated = await this.tokens.rotate(refreshToken, userAgent);
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: withIdentities,
    });
    if (!user) throw new UnauthorizedException();
    return { user: toUserDto(user), tokens: rotated };
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.revoke(refreshToken);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('dummy-password-for-timing', { type: argon2.argon2id });
    return this.dummyHash;
  }
}
