import { z } from "zod";
import type { WorkspaceRole } from "./auth";
import { currencySchema } from "./money";

/** Roles that can be granted to a member. Ownership changes only through a transfer. */
export const GRANTABLE_ROLES = ["admin", "editor", "viewer"] as const;
export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

export const ROLE_RANK: Record<WorkspaceRole, number> = { owner: 3, admin: 2, editor: 1, viewer: 0 };

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

/** Owners and admins approve join requests and manage members. */
export function canManageMembers(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Roles an actor may hand out (on approval or a role change). Owners and site admins may
 * grant admin; workspace admins only editor and viewer.
 */
export function grantableRoles(actorRole: WorkspaceRole | null | undefined, isSiteAdmin = false): GrantableRole[] {
  if (isSiteAdmin || actorRole === "owner") return [...GRANTABLE_ROLES];
  if (actorRole === "admin") return ["editor", "viewer"];
  return [];
}

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
  baseCurrency: currencySchema.optional(),
});
export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;
export type CreateWorkspaceData = z.output<typeof createWorkspaceSchema>;

export const workspaceSearchSchema = z.object({
  q: z.string().trim().min(2, "Type at least 2 characters").max(80),
});
export type WorkspaceSearchInput = z.input<typeof workspaceSearchSchema>;

export const createJoinRequestSchema = z.object({
  message: z.string().trim().max(280).optional(),
});
export type CreateJoinRequestInput = z.input<typeof createJoinRequestSchema>;

export const approveJoinRequestSchema = z.object({
  role: z.enum(GRANTABLE_ROLES).default("viewer"),
});
export type ApproveJoinRequestInput = z.input<typeof approveJoinRequestSchema>;

export const updateMemberSchema = z.object({
  /** "owner" transfers ownership; the current owner becomes an admin. */
  role: z.enum(["owner", ...GRANTABLE_ROLES]),
});
export type UpdateMemberInput = z.input<typeof updateMemberSchema>;

export type JoinRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface WorkspaceSearchResultDto {
  id: string;
  name: string;
  baseCurrency: string;
  /** Display names of the owner and admins, owner first. */
  admins: { displayName: string | null; role: WorkspaceRole }[];
  memberCount: number;
  /** The caller's role here, if they are a member. */
  myRole: WorkspaceRole | null;
  /** The caller's latest join request here, if any. */
  myRequestStatus: JoinRequestStatus | null;
}

export interface JoinRequestDto {
  id: string;
  status: JoinRequestStatus;
  message: string | null;
  grantedRole: WorkspaceRole | null;
  createdAt: string;
  decidedAt: string | null;
  workspace: { id: string; name: string };
  user: { id: string; displayName: string | null; email: string };
  decidedBy: { id: string; displayName: string | null } | null;
}

export interface MemberDto {
  userId: string;
  displayName: string | null;
  email: string;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: string;
}

/** Owners, admins and editors add and edit records; viewers only read. */
export function canWrite(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}
