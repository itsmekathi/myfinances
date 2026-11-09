import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { WorkspaceSummaryDto } from '@myfinances/shared';
import { seedDefaultCategories } from './default-categories';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import type { Env } from '../config/env';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Every new user gets a personal workspace seeded with default categories. */
  async createPersonal(tx: Prisma.TransactionClient, userId: string, ownerName: string) {
    const workspace = await tx.workspace.create({
      data: {
        name: `${ownerName}'s finances`,
        baseCurrency: this.config.get('DEFAULT_CURRENCY', { infer: true }),
        members: { create: { userId, role: 'owner' } },
      },
    });
    await seedDefaultCategories(tx, workspace.id);
    return workspace;
  }

  async listForUser(userId: string): Promise<WorkspaceSummaryDto[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      baseCurrency: m.workspace.baseCurrency,
      role: m.role,
    }));
  }
}
