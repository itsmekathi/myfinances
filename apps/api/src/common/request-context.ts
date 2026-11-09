import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { WorkspaceRole } from '../generated/prisma/enums';

export interface AuthUser {
  userId: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  role: WorkspaceRole;
  baseCurrency: string;
}

export type AppRequest = Request & { user?: AuthUser; workspace?: WorkspaceContext };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.user) throw new Error('CurrentUser used on a route without authentication');
  return req.user;
});

export const CurrentWorkspace = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorkspaceContext => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.workspace) throw new Error('CurrentWorkspace used without WorkspaceGuard');
    return req.workspace;
  },
);
