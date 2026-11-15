import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  canManageMembers,
  grantableRoles,
  ROLE_RANK,
  type CreateWorkspaceData,
  type GrantableRole,
  type JoinRequestDto,
  type MemberDto,
  type WorkspaceRole,
  type WorkspaceSearchResultDto,
  type WorkspaceSummaryDto,
} from '@myfinances/shared';
import { seedDefaultCategories } from './default-categories';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, type JoinRequestStatus } from '../generated/prisma/client';
import type { Env } from '../config/env';

const SEARCH_LIMIT = 20;

const joinRequestInclude = {
  workspace: { select: { id: true, name: true } },
  user: { select: { id: true, displayName: true, email: true } },
  decidedBy: { select: { id: true, displayName: true } },
} as const;

type JoinRequestRow = Prisma.JoinRequestGetPayload<{ include: typeof joinRequestInclude }>;

function toJoinRequestDto(r: JoinRequestRow): JoinRequestDto {
  return {
    id: r.id,
    status: r.status,
    message: r.message,
    grantedRole: r.grantedRole,
    createdAt: r.createdAt.toISOString(),
    decidedAt: r.decidedAt?.toISOString() ?? null,
    workspace: r.workspace,
    user: r.user,
    decidedBy: r.decidedBy,
  };
}

/** Who is acting on a join request: a member of the workspace, a site admin, or both. */
interface Actor {
  userId: string;
  role: WorkspaceRole | null;
  isSiteAdmin: boolean;
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** A new household: the creator becomes its owner and gets the default categories. */
  async create(userId: string, input: CreateWorkspaceData): Promise<WorkspaceSummaryDto> {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          baseCurrency: input.baseCurrency ?? this.config.get('DEFAULT_CURRENCY', { infer: true }),
          members: { create: { userId, role: 'owner' } },
        },
      });
      await seedDefaultCategories(tx, created.id);
      return created;
    });
    return { id: workspace.id, name: workspace.name, baseCurrency: workspace.baseCurrency, role: 'owner' };
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

  /** Every workspace is searchable by name; results show the owner and admins. */
  async search(userId: string, q: string): Promise<WorkspaceSearchResultDto[]> {
    const rows = await this.prisma.workspace.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      take: SEARCH_LIMIT,
      include: {
        members: {
          where: { OR: [{ role: { in: ['owner', 'admin'] } }, { userId }] },
          include: { user: { select: { displayName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        joinRequests: { where: { userId }, select: { status: true } },
        _count: { select: { members: true } },
      },
    });
    return rows.map((w) => ({
      id: w.id,
      name: w.name,
      baseCurrency: w.baseCurrency,
      admins: w.members
        .filter((m) => m.role === 'owner' || m.role === 'admin')
        .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role])
        .map((m) => ({ displayName: m.user.displayName, role: m.role })),
      memberCount: w._count.members,
      myRole: w.members.find((m) => m.userId === userId)?.role ?? null,
      myRequestStatus: w.joinRequests[0]?.status ?? null,
    }));
  }

  // ---------------------------------------------------------------- members

  /** The caller's role, or 404 (not 403) so non-members can't probe workspace ids. */
  async requireRole(workspaceId: string, userId: string): Promise<WorkspaceRole> {
    const m = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!m) throw new NotFoundException('Workspace not found');
    return m.role;
  }

  async listMembers(workspaceId: string): Promise<MemberDto[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { displayName: true, email: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members
      .map((m) => ({
        userId: m.userId,
        displayName: m.user.displayName,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.createdAt.toISOString(),
      }))
      .sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]);
  }

  /**
   * Owners manage everyone else; admins manage editors and viewers. Setting "owner" transfers
   * ownership: only the owner can, and they become an admin.
   */
  async updateMemberRole(
    workspaceId: string,
    actorId: string,
    targetId: string,
    role: WorkspaceRole,
  ): Promise<MemberDto[]> {
    if (actorId === targetId) throw new BadRequestException('You cannot change your own role');
    const actorRole = await this.requireRole(workspaceId, actorId);
    const targetRole = await this.manageableTarget(workspaceId, actorRole, targetId);

    if (role === 'owner') {
      if (actorRole !== 'owner') throw new ForbiddenException('Only the owner can transfer ownership');
      await this.prisma.$transaction([
        this.prisma.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId: targetId } },
          data: { role: 'owner' },
        }),
        this.prisma.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId: actorId } },
          data: { role: 'admin' },
        }),
      ]);
    } else if (role !== targetRole) {
      if (!grantableRoles(actorRole).includes(role)) {
        throw new ForbiddenException(`You cannot grant the ${role} role`);
      }
      await this.prisma.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: targetId } },
        data: { role },
      });
    }
    return this.listMembers(workspaceId);
  }

  /** Removes a member, or lets a member leave. The owner must transfer ownership first. */
  async removeMember(workspaceId: string, actorId: string, targetId: string): Promise<void> {
    const actorRole = await this.requireRole(workspaceId, actorId);
    if (actorId === targetId) {
      if (actorRole === 'owner') {
        throw new BadRequestException('Transfer ownership to another member before leaving');
      }
    } else {
      await this.manageableTarget(workspaceId, actorRole, targetId);
    }
    await this.prisma.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
    });
  }

  private async manageableTarget(workspaceId: string, actorRole: WorkspaceRole, targetId: string) {
    if (!canManageMembers(actorRole)) throw new ForbiddenException('Only owners and admins can manage members');
    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (ROLE_RANK[target.role] >= ROLE_RANK[actorRole]) {
      throw new ForbiddenException(`You cannot manage a member with the ${target.role} role`);
    }
    return target.role;
  }

  // ---------------------------------------------------------- join requests

  /** Asks to join. Asking again after a rejection or cancellation reopens the request. */
  async requestToJoin(workspaceId: string, userId: string, message?: string): Promise<JoinRequestDto> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, members: { where: { userId }, select: { role: true } } },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.members.length) throw new ConflictException('You are already a member of this workspace');

    const existing = await this.prisma.joinRequest.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { status: true },
    });
    if (existing?.status === 'pending') throw new ConflictException('You have already asked to join');

    const fresh = {
      status: 'pending' as const,
      message: message || null,
      grantedRole: null,
      decidedById: null,
      decidedAt: null,
      createdAt: new Date(),
    };
    try {
      const row = await this.prisma.joinRequest.upsert({
        where: { workspaceId_userId: { workspaceId, userId } },
        create: { workspaceId, userId, ...fresh },
        update: fresh,
        include: joinRequestInclude,
      });
      return toJoinRequestDto(row);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('You have already asked to join');
      }
      throw e;
    }
  }

  async listMyRequests(userId: string): Promise<JoinRequestDto[]> {
    const rows = await this.prisma.joinRequest.findMany({
      where: { userId },
      include: joinRequestInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toJoinRequestDto);
  }

  /** Pending requests for one workspace (owners and admins) or, with no workspace, all of them (site admins). */
  async listPending(workspaceId?: string): Promise<JoinRequestDto[]> {
    const rows = await this.prisma.joinRequest.findMany({
      where: { status: 'pending', ...(workspaceId ? { workspaceId } : {}) },
      include: joinRequestInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toJoinRequestDto);
  }

  async listPendingFor(workspaceId: string, userId: string): Promise<JoinRequestDto[]> {
    const role = await this.requireRole(workspaceId, userId);
    if (!canManageMembers(role)) throw new ForbiddenException('Only owners and admins can see join requests');
    return this.listPending(workspaceId);
  }

  async approve(requestId: string, actorId: string, role: GrantableRole): Promise<JoinRequestDto> {
    const { request, actor } = await this.pendingRequestFor(requestId, actorId);
    if (!grantableRoles(actor.role, actor.isSiteAdmin).includes(role)) {
      throw new ForbiddenException(`You cannot grant the ${role} role`);
    }
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.createMany({
        data: [{ workspaceId: request.workspaceId, userId: request.userId, role }],
        skipDuplicates: true,
      });
      return this.decide(tx, requestId, actorId, 'approved', role);
    });
    return toJoinRequestDto(row);
  }

  async reject(requestId: string, actorId: string): Promise<JoinRequestDto> {
    await this.pendingRequestFor(requestId, actorId);
    return toJoinRequestDto(await this.decide(this.prisma, requestId, actorId, 'rejected', null));
  }

  async cancel(requestId: string, userId: string): Promise<JoinRequestDto> {
    const request = await this.prisma.joinRequest.findFirst({ where: { id: requestId, userId } });
    if (!request) throw new NotFoundException('Join request not found');
    if (request.status !== 'pending') throw new ConflictException(`This request was already ${request.status}`);
    return toJoinRequestDto(await this.decide(this.prisma, requestId, userId, 'cancelled', null));
  }

  /**
   * Loads a pending request the actor may decide: as an owner/admin of its workspace or as a
   * site admin. Anyone else gets a 404, so request ids can't be probed.
   */
  private async pendingRequestFor(requestId: string, actorId: string) {
    const request = await this.prisma.joinRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Join request not found');

    const [membership, user] = await Promise.all([
      this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: request.workspaceId, userId: actorId } },
        select: { role: true },
      }),
      this.prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
    ]);
    const actor: Actor = { userId: actorId, role: membership?.role ?? null, isSiteAdmin: user?.role === 'admin' };
    if (!actor.isSiteAdmin && !canManageMembers(actor.role)) throw new NotFoundException('Join request not found');
    if (request.status !== 'pending') throw new ConflictException(`This request was already ${request.status}`);
    return { request, actor };
  }

  /** Marks a request decided, but only if it is still pending (two admins may act at once). */
  private async decide(
    db: Prisma.TransactionClient,
    requestId: string,
    actorId: string,
    status: JoinRequestStatus,
    grantedRole: WorkspaceRole | null,
  ): Promise<JoinRequestRow> {
    const { count } = await db.joinRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status, grantedRole, decidedById: actorId, decidedAt: new Date() },
    });
    if (!count) throw new ConflictException('This request was already decided');
    return db.joinRequest.findUniqueOrThrow({ where: { id: requestId }, include: joinRequestInclude });
  }
}
