import type {
  AuthResponse,
  CategoryDto,
  CreateCategoryInput,
  CreateExpenseInput,
  AttachmentDto,
  ExpenseDetailDto,
  ExpenseDto,
  LoginInput,
  MeResponse,
  Paginated,
  RegisterInput,
  StatsSummary,
  UpdateCategoryInput,
  UpdateExpenseInput,
  UserDto,
} from '@myfinances/shared';

export interface ApiClientOptions {
  /** e.g. "/api" on the web (proxied by Vite) or "http://192.168.1.10:3000/api" on a phone. */
  baseUrl: string;
  /**
   * web: the refresh token lives in an httpOnly cookie the browser manages.
   * mobile: the refresh token is returned in the body and stored via the callbacks below.
   */
  clientType: 'web' | 'mobile';
  loadRefreshToken?: () => Promise<string | null>;
  saveRefreshToken?: (token: string | null) => Promise<void>;
  /** Called when the session can't be refreshed and the user must sign in again. */
  onSessionExpired?: () => void;
  fetch?: typeof fetch;
  /** Sent with every request, e.g. X-Client-Platform / X-App-Version from the mobile app. */
  extraHeaders?: Record<string, string>;
}

/** A file to upload: a browser File/Blob, or a React Native file reference. */
export type UploadFile = Blob | { uri: string; name: string; type: string };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(ApiError.messageFrom(status, body));
  }

  private static messageFrom(status: number, body: unknown): string {
    if (body && typeof body === 'object' && 'message' in body) {
      const m = (body as { message: unknown }).message;
      if (Array.isArray(m)) return m.join('\n');
      if (typeof m === 'string') return m;
    }
    return `Request failed (${status})`;
  }
}

export interface ExpenseListParams {
  from?: string;
  to?: string;
  categoryId?: string;
  subcategoryId?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  let accessToken: string | null = null;
  let refreshInFlight: Promise<UserDto | null> | null = null;

  function baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = { ...(opts.extraHeaders ?? {}) };
    if (opts.clientType === 'mobile') headers['X-Client-Type'] = 'mobile';
    return headers;
  }

  async function raw<T>(
    method: Method,
    path: string,
    body?: unknown,
    auth = true,
    responseType: 'json' | 'blob' = 'json',
  ): Promise<T> {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers = baseHeaders();
    if (responseType === 'json') headers.Accept = 'application/json';
    // For FormData, fetch sets the multipart Content-Type (with boundary) itself.
    if (body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await doFetch(`${opts.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      credentials: opts.clientType === 'web' ? 'include' : 'omit',
    });
    if (res.status === 204) return undefined as T;
    if (res.ok && responseType === 'blob') return (await res.blob()) as T;
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = { message: text };
    }
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }

  /** Authenticated request; on 401 it refreshes the session once and retries. */
  async function request<T>(
    method: Method,
    path: string,
    body?: unknown,
    responseType: 'json' | 'blob' = 'json',
  ): Promise<T> {
    try {
      return await raw<T>(method, path, body, true, responseType);
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
      const user = await refreshSession();
      if (!user) throw e;
      return raw<T>(method, path, body, true, responseType);
    }
  }

  async function acceptSession(res: AuthResponse): Promise<UserDto> {
    accessToken = res.accessToken;
    if (opts.clientType === 'mobile' && res.refreshToken) {
      await opts.saveRefreshToken?.(res.refreshToken);
    }
    return res.user;
  }

  async function clearSession() {
    accessToken = null;
    if (opts.clientType === 'mobile') await opts.saveRefreshToken?.(null);
  }

  /**
   * Gets a fresh access token from the refresh token. Concurrent callers share one request,
   * because refresh tokens are single-use.
   */
  function refreshSession(): Promise<UserDto | null> {
    refreshInFlight ??= (async () => {
      try {
        const refreshToken =
          opts.clientType === 'mobile' ? await opts.loadRefreshToken?.() : undefined;
        if (opts.clientType === 'mobile' && !refreshToken) return null;
        const res = await raw<AuthResponse>('POST', '/auth/refresh', { refreshToken }, false);
        return await acceptSession(res);
      } catch {
        const hadSession = accessToken !== null;
        await clearSession();
        if (hadSession) opts.onSessionExpired?.();
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;

  return {
    auth: {
      register: async (input: RegisterInput) =>
        acceptSession(await raw<AuthResponse>('POST', '/auth/register', input, false)),
      login: async (input: LoginInput) =>
        acceptSession(await raw<AuthResponse>('POST', '/auth/login', input, false)),
      google: async (idToken: string) =>
        acceptSession(await raw<AuthResponse>('POST', '/auth/google', { idToken }, false)),
      /** Try to resume a previous session (on app start). Resolves to null if signed out. */
      restore: () => refreshSession(),
      logout: async () => {
        const refreshToken =
          opts.clientType === 'mobile' ? await opts.loadRefreshToken?.() : undefined;
        await raw<void>('POST', '/auth/logout', { refreshToken: refreshToken ?? undefined }, false).catch(
          () => undefined,
        );
        await clearSession();
      },
      isSignedIn: () => accessToken !== null,
    },

    me: () => request<MeResponse>('GET', '/me'),

    categories: {
      list: (workspaceId: string) => request<CategoryDto[]>('GET', `${ws(workspaceId)}/categories`),
      create: (workspaceId: string, input: CreateCategoryInput) =>
        request<CategoryDto>('POST', `${ws(workspaceId)}/categories`, input),
      update: (workspaceId: string, id: string, input: UpdateCategoryInput) =>
        request<CategoryDto>('PATCH', `${ws(workspaceId)}/categories/${id}`, input),
      remove: (workspaceId: string, id: string) =>
        request<void>('DELETE', `${ws(workspaceId)}/categories/${id}`),
    },

    expenses: {
      list: (workspaceId: string, params: ExpenseListParams = {}) =>
        request<Paginated<ExpenseDto>>('GET', `${ws(workspaceId)}/expenses${queryString(params)}`),
      get: (workspaceId: string, id: string) =>
        request<ExpenseDetailDto>('GET', `${ws(workspaceId)}/expenses/${id}`),
      create: (workspaceId: string, input: CreateExpenseInput) =>
        request<ExpenseDetailDto>('POST', `${ws(workspaceId)}/expenses`, input),
      update: (workspaceId: string, id: string, input: UpdateExpenseInput) =>
        request<ExpenseDetailDto>('PATCH', `${ws(workspaceId)}/expenses/${id}`, input),
      remove: (workspaceId: string, id: string) =>
        request<void>('DELETE', `${ws(workspaceId)}/expenses/${id}`),
    },

    attachments: {
      /** Path relative to baseUrl; mobile builds a full URL with it for <Image> previews. */
      path: (workspaceId: string, expenseId: string, id: string) =>
        `${ws(workspaceId)}/expenses/${expenseId}/attachments/${id}`,
      upload: (workspaceId: string, expenseId: string, file: UploadFile, fileName?: string) => {
        const form = new FormData();
        if (typeof Blob !== 'undefined' && file instanceof Blob) {
          form.append('file', file, fileName ?? (file as File).name ?? 'upload');
        } else {
          // React Native's FormData accepts { uri, name, type } objects.
          form.append('file', file as unknown as Blob);
        }
        return request<AttachmentDto>('POST', `${ws(workspaceId)}/expenses/${expenseId}/attachments`, form);
      },
      download: (workspaceId: string, expenseId: string, id: string) =>
        request<Blob>('GET', `${ws(workspaceId)}/expenses/${expenseId}/attachments/${id}`, undefined, 'blob'),
      remove: (workspaceId: string, expenseId: string, id: string) =>
        request<void>('DELETE', `${ws(workspaceId)}/expenses/${expenseId}/attachments/${id}`),
    },

    /** Headers for loading protected URLs outside this client (e.g. <Image source={{ uri, headers }}>). */
    authHeaders: (): Record<string, string> => ({
      ...baseHeaders(),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }),
    baseUrl: opts.baseUrl,

    stats: {
      summary: (workspaceId: string, from: string, to: string) =>
        request<StatsSummary>('GET', `${ws(workspaceId)}/stats/summary${queryString({ from, to })}`),
    },
  };
}

/** Manual query string building: React Native's URLSearchParams is incomplete. */
function queryString(params: object): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

export type ApiClient = ReturnType<typeof createApiClient>;
