import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DeleteAccountInput, LoginInput, RegisterInput, UserDto, WorkspaceSummaryDto } from '@myfinances/shared';
import { api, onSessionExpired } from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { googleSignOut } from '../lib/google';

const SELECTED_KEY = 'mf.workspace';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: UserDto | null;
  /** Every workspace the user belongs to. Empty until they create or join one. */
  workspaces: WorkspaceSummaryDto[];
  /** The selected workspace (remembered on the device). */
  workspace: WorkspaceSummaryDto | null;
  selectWorkspace: (id: string) => void;
  /** Reloads the user and their workspaces, e.g. after creating or joining one. */
  refreshProfile: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Permanently deletes the account, then signs out. */
  deleteAccount: (input: DeleteAccountInput) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<UserDto | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummaryDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const workspace = workspaces.find((w) => w.id === selectedId) ?? workspaces[0] ?? null;

  const loadProfile = useCallback(async () => {
    const [me, saved] = await Promise.all([api.me(), SecureStore.getItemAsync(SELECTED_KEY).catch(() => null)]);
    setUser(me.user);
    setWorkspaces(me.workspaces);
    setSelectedId((current) => current ?? saved);
    setStatus('signedIn');
  }, []);

  const selectWorkspace = useCallback((id: string) => {
    setSelectedId(id);
    void SecureStore.setItemAsync(SELECTED_KEY, id).catch(() => undefined);
  }, []);

  const signOutLocally = useCallback(() => {
    setUser(null);
    setWorkspaces([]);
    setSelectedId(null);
    setStatus('signedOut');
    queryClient.clear();
  }, [queryClient]);

  // Resume the session from the refresh token in SecureStore.
  useEffect(() => {
    let cancelled = false;
    api.auth
      .restore()
      .then((u) => {
        if (cancelled) return;
        return u ? loadProfile() : signOutLocally();
      })
      .catch(() => {
        if (!cancelled) signOutLocally();
      });
    return () => {
      cancelled = true;
    };
  }, [loadProfile, signOutLocally]);

  useEffect(() => onSessionExpired(signOutLocally), [signOutLocally]);

  const value: AuthState = {
    status,
    user,
    workspaces,
    workspace,
    selectWorkspace,
    refreshProfile: loadProfile,
    login: async (input) => {
      await api.auth.login(input);
      await loadProfile();
    },
    register: async (input) => {
      await api.auth.register(input);
      await loadProfile();
    },
    loginWithGoogle: async (idToken) => {
      await api.auth.google(idToken);
      await loadProfile();
    },
    logout: async () => {
      await api.auth.logout();
      await googleSignOut();
      signOutLocally();
    },
    deleteAccount: async (input) => {
      await api.account.delete(input);
      await googleSignOut();
      signOutLocally();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useWorkspace(): WorkspaceSummaryDto {
  const { workspace } = useAuth();
  if (!workspace) throw new Error('No workspace loaded');
  return workspace;
}
