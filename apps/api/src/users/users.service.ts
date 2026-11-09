import { Injectable, NotFoundException } from '@nestjs/common';
import type { UserDto } from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async getById(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identities: { select: { provider: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return toUserDto(user);
  }
}
