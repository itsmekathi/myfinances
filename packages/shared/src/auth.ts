import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Only letters, numbers, _ . - allowed");

export const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** Email or username */
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;

/** Mobile sends the refresh token in the body; web relies on an httpOnly cookie. */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/**
 * Permanently deletes the signed-in user's account. The account email must be typed to
 * confirm; accounts with a password must also give it (Google-only accounts can't).
 */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1).max(128).optional(),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

export interface UserDto {
  id: string;
  email: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  providers: string[];
}

export interface WorkspaceSummaryDto {
  id: string;
  name: string;
  baseCurrency: string;
  role: WorkspaceRole;
}

export type WorkspaceRole = "owner" | "editor" | "viewer";

export interface AuthResponse {
  accessToken: string;
  /** Only returned to clients that ask for it (mobile). Web gets an httpOnly cookie. */
  refreshToken?: string;
  user: UserDto;
}

export interface MeResponse {
  user: UserDto;
  workspaces: WorkspaceSummaryDto[];
}
