import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { DeleteAccountInput, UserDto } from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { AuthIdentity, User } from '../generated/prisma/client';

export function toUserDto(user: User & { identities?: Pick<AuthIdentity, 'provider'>[] }): UserDto {
  const providers = (user.identities ?? []).map((i) => i.provider as string);
  if (user.passwordHash) providers.unshift('password');
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    hasPassword: Boolean(user.passwordHash),
    providers,
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getById(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identities: { select: { provider: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return toUserDto(user);
  }

  /**
   * Permanently deletes the user and every workspace they are the only member of
   * (expenses, items, attachments and categories cascade), then their stored files.
   * Refuses if they share a workspace with others: their expenses there would be orphaned.
   */
  async deleteAccount(userId: string, input: DeleteAccountInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (input.confirmEmail !== user.email.toLowerCase()) {
      throw new BadRequestException('The email you typed does not match your account');
    }
    if (user.passwordHash) {
      const ok = input.password ? await argon2.verify(user.passwordHash, input.password).catch(() => false) : false;
      if (!ok) throw new UnauthorizedException('Incorrect password');
    }

    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      select: { workspaceId: true, workspace: { select: { _count: { select: { members: true } } } } },
    });
    if (memberships.some((m) => m.workspace._count.members > 1)) {
      throw new ConflictException('Leave or transfer your shared workspaces before deleting your account');
    }
    const workspaceIds = memberships.map((m) => m.workspaceId);

    const files = await this.prisma.attachment.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { storageKey: true },
    });

    await this.prisma.$transaction([
      this.prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } }),
      // Identities, refresh tokens and memberships cascade.
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    // After the commit, so a storage failure can't leave records pointing at nothing.
    try {
      await this.storage.removeMany(files.map((f) => f.storageKey));
    } catch (e) {
      this.logger.error(`Account ${userId} deleted, but removing ${files.length} file(s) failed`, e as Error);
    }
  }
}
