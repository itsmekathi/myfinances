import { CanActivate, Controller, ExecutionContext, Get, Injectable, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { JoinRequestDto } from '@myfinances/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AppRequest } from '../common/request-context';
import { WorkspacesService } from '../workspaces/workspaces.service';

/** Site admins only. Others get 404 so the admin routes stay invisible. */
@Injectable()
export class SiteAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const user = req.user
      ? await this.prisma.user.findUnique({ where: { id: req.user.userId }, select: { role: true } })
      : null;
    if (user?.role !== 'admin') throw new NotFoundException();
    return true;
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(SiteAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** Pending join requests across every workspace. Approve/reject via /join-requests/:id. */
  @Get('join-requests')
  pendingJoinRequests(): Promise<JoinRequestDto[]> {
    return this.workspaces.listPending();
  }
}
