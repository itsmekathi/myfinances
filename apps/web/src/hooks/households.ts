import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateWorkspaceInput, GrantableRole, WorkspaceRole } from '@myfinances/shared';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

export function useWorkspaceSearch(q: string) {
  const term = q.trim();
  return useQuery({
    queryKey: ['workspaceSearch', term],
    queryFn: () => api.workspaces.search(term),
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
}

/** The caller's join requests. Polls while one is pending, so an approval shows up by itself. */
export function useMyJoinRequests() {
  return useQuery({
    queryKey: ['myJoinRequests'],
    queryFn: () => api.joinRequests.mine(),
    refetchInterval: (query) => (query.state.data?.some((r) => r.status === 'pending') ? 15_000 : false),
  });
}

export function useMembers(workspaceId: string) {
  return useQuery({ queryKey: ['members', workspaceId], queryFn: () => api.workspaces.members(workspaceId) });
}

export function useWorkspaceJoinRequests(workspaceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['joinRequests', workspaceId],
    queryFn: () => api.joinRequests.listForWorkspace(workspaceId),
    enabled,
  });
}

export function useAdminJoinRequests(enabled: boolean) {
  return useQuery({
    queryKey: ['adminJoinRequests'],
    queryFn: () => api.admin.pendingJoinRequests(),
    enabled,
  });
}

export function useCreateWorkspace() {
  const { refreshProfile, selectWorkspace } = useAuth();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => api.workspaces.create(input),
    onSuccess: async (ws) => {
      await refreshProfile();
      selectWorkspace(ws.id);
    },
  });
}

export function useRequestToJoin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { workspaceId: string; message?: string }) =>
      api.joinRequests.create(args.workspaceId, { message: args.message || undefined }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['myJoinRequests'] });
      void qc.invalidateQueries({ queryKey: ['workspaceSearch'] });
    },
  });
}

export function useCancelJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.joinRequests.cancel(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['myJoinRequests'] });
      void qc.invalidateQueries({ queryKey: ['workspaceSearch'] });
    },
  });
}

/** Approve or reject, as a workspace owner/admin or a site admin. */
export function useDecideJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; approve: boolean; role?: GrantableRole }) =>
      args.approve ? api.joinRequests.approve(args.id, { role: args.role }) : api.joinRequests.reject(args.id),
    onSuccess: (req) => {
      void qc.invalidateQueries({ queryKey: ['joinRequests', req.workspace.id] });
      void qc.invalidateQueries({ queryKey: ['members', req.workspace.id] });
      void qc.invalidateQueries({ queryKey: ['adminJoinRequests'] });
    },
  });
}

export function useUpdateMember(workspaceId: string) {
  const qc = useQueryClient();
  const { refreshProfile } = useAuth();
  return useMutation({
    mutationFn: (args: { userId: string; role: WorkspaceRole }) =>
      api.workspaces.updateMember(workspaceId, args.userId, { role: args.role }),
    onSuccess: async (members, args) => {
      qc.setQueryData(['members', workspaceId], members);
      // A transfer changes the caller's own role.
      if (args.role === 'owner') await refreshProfile();
    },
  });
}

export function useRemoveMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.workspaces.removeMember(workspaceId, userId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['members', workspaceId] }),
  });
}
