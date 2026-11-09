import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isUuid } from '../common/dates';
import type { AppRequest } from '../common/request-context';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protects routes under /workspaces/:workspaceId.
 * The caller must be a member; viewers may only read.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) throw new UnauthorizedException();

    const workspaceId = req.params.workspaceId;
    if (!isUuid(workspaceId)) throw new NotFoundException('Workspace not found');

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.user.userId } },
      include: { workspace: { select: { baseCurrency: true } } },
    });
    // 404 rather than 403 so we don't reveal which workspace ids exist.
    if (!membership) throw new NotFoundException('Workspace not found');

    if (!READ_METHODS.has(req.method) && membership.role === 'viewer') {
      throw new ForbiddenException('Viewers cannot modify this workspace');
    }

    req.workspace = {
      workspaceId,
      role: membership.role,
      baseCurrency: membership.workspace.baseCurrency,
    };
    return true;
  }
}
