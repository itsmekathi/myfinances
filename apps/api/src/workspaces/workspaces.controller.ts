import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  approveJoinRequestSchema,
  createJoinRequestSchema,
  createWorkspaceSchema,
  updateMemberSchema,
  workspaceSearchSchema,
  type CreateWorkspaceData,
  type JoinRequestDto,
  type MemberDto,
  type WorkspaceSearchResultDto,
  type WorkspaceSummaryDto,
} from '@myfinances/shared';
import type { z } from 'zod';
import { CurrentUser, type AuthUser } from '../common/request-context';
import { WorkspacesService } from './workspaces.service';

/**
 * Households: create, search, join and manage members. These routes don't use WorkspaceGuard,
 * because non-members search and ask to join, and viewers may leave; the service checks roles.
 */
@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createWorkspaceSchema }) body: CreateWorkspaceData,
  ): Promise<WorkspaceSummaryDto> {
    return this.workspaces.create(user.userId, body);
  }

  @Get('search')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  search(
    @CurrentUser() user: AuthUser,
    @Query({ schema: workspaceSearchSchema }) query: z.output<typeof workspaceSearchSchema>,
  ): Promise<WorkspaceSearchResultDto[]> {
    return this.workspaces.search(user.userId, query.q);
  }

  @Post(':workspaceId/join-requests')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  requestToJoin(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Body({ schema: createJoinRequestSchema }) body: z.output<typeof createJoinRequestSchema>,
  ): Promise<JoinRequestDto> {
    return this.workspaces.requestToJoin(workspaceId, user.userId, body.message);
  }

  /** Pending requests; owners and admins only. */
  @Get(':workspaceId/join-requests')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<JoinRequestDto[]> {
    return this.workspaces.listPendingFor(workspaceId, user.userId);
  }

  @Get(':workspaceId/members')
  async listMembers(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
  ): Promise<MemberDto[]> {
    await this.workspaces.requireRole(workspaceId, user.userId);
    return this.workspaces.listMembers(workspaceId);
  }

  @Patch(':workspaceId/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
    @Body({ schema: updateMemberSchema }) body: z.output<typeof updateMemberSchema>,
  ): Promise<MemberDto[]> {
    return this.workspaces.updateMemberRole(workspaceId, user.userId, targetId, body.role);
  }

  /** Removes a member; with your own id, leaves the workspace. */
  @Delete(':workspaceId/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('userId', ParseUUIDPipe) targetId: string,
  ): Promise<void> {
    return this.workspaces.removeMember(workspaceId, user.userId, targetId);
  }
}

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('join-requests')
export class JoinRequestsController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** The caller's own requests, newest first. */
  @Get('mine')
  mine(@CurrentUser() user: AuthUser): Promise<JoinRequestDto[]> {
    return this.workspaces.listMyRequests(user.userId);
  }

  /** Workspace owners/admins, or a site admin for any workspace. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: approveJoinRequestSchema }) body: z.output<typeof approveJoinRequestSchema>,
  ): Promise<JoinRequestDto> {
    return this.workspaces.approve(id, user.userId, body.role);
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<JoinRequestDto> {
    return this.workspaces.reject(id, user.userId);
  }

  /** The requester withdraws a pending request. */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<JoinRequestDto> {
    return this.workspaces.cancel(id, user.userId);
  }
}
