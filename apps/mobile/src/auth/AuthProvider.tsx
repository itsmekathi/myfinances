import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DeleteAccountInput, LoginInput, RegisterInput, UserDto, WorkspaceSummaryDto } from '@myfinances/shared';
import { api, onSessionExpired } from '../lib/api';
import { googleSignOut } from '../lib/google';

type Status = 'loading' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: UserDto | null;
  workspace: WorkspaceSummaryDto | null;
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
  const [workspace, setWorkspace] = useState<WorkspaceSummaryDto | null>(null);

  const loadProfile = useCallback(async () => {
    const me = await api.me();
    setUser(me.user);
    setWorkspace(me.workspaces[0] ?? null);
    setStatus('signedIn');
  }, []);

  const signOutLocally = useCallback(() => {
    setUser(null);
    setWorkspace(null);
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
    workspace,
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
