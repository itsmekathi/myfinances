import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { MeResponse } from '@myfinances/shared';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { UsersService } from './users.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  async me(@CurrentUser() auth: AuthUser): Promise<MeResponse> {
    const [user, workspaces] = await Promise.all([
      this.users.getById(auth.userId),
      this.workspaces.listForUser(auth.userId),
    ]);
    return { user, workspaces };
  }
}
