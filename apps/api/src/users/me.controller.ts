import { Body, Controller, Delete, Get, HttpCode, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { deleteAccountSchema, type DeleteAccountInput, type MeResponse } from '@myfinances/shared';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from '../auth/auth.controller';
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

  /** Permanently deletes the account and its data. Strict limit: it checks a password. */
  @Delete()
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async deleteAccount(
    @CurrentUser() auth: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.users.deleteAccount(auth.userId, body);
    // Web keeps the refresh token in an httpOnly cookie; clear it with the session.
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }
}
