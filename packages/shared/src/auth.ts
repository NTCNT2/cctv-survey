import { z } from 'zod';
import { USER_ROLES, type UserRole } from './enums.js';

/** Lower-case letters, digits, `.`, `_`, `-`; 3–32 chars. Normalised to lower case. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9._-]{3,32}$/,
    'username must be 3–32 characters: a-z, 0-9, dot, underscore, hyphen',
  );

/** Password policy. The upper bound stops very long inputs from tying up Argon2. */
export const passwordSchema = z
  .string()
  .min(12, 'password must be at least 12 characters')
  .max(128, 'password must be at most 128 characters');

const displayNameSchema = z.string().trim().min(1).max(100);

/** Login does not re-apply the password policy, so older passwords keep working. */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema.optional(),
    role: z.enum(USER_ROLES),
    password: passwordSchema,
  })
  .refine((v) => v.password.toLowerCase() !== v.username, {
    path: ['password'],
    message: 'password must not equal the username',
  });
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Admin PATCH: `null` clears displayName. Usernames cannot change. */
export const updateUserSchema = z
  .object({
    displayName: displayNameSchema.nullable(),
    role: z.enum(USER_ROLES),
    isActive: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field is required');
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'new password must differ from the current one',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const resetPasswordSchema = z.object({ newPassword: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** The signed-in user as returned by /auth/login and /auth/me. */
export interface AuthUser {
  id: string;
  username: string;
  displayName?: string;
  role: UserRole;
}

export interface User extends AuthUser {
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** The token itself is only ever sent as an HttpOnly cookie, never in a body. */
export interface LoginResponse {
  user: AuthUser;
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// Permissions — the single source of truth for the API guard and the web UI.
// ---------------------------------------------------------------------------

export const ACTIONS = [
  'project:read',
  'project:write',
  'project:delete',
  'site:read',
  'site:write',
  'site:delete',
  'camera:read',
  'camera:write',
  'camera:delete',
  /** Add / edit / (de)activate camera models in the master list. */
  'camera_model:manage',
  'user:manage',
] as const;
export type Action = (typeof ACTIONS)[number];

const READ: readonly Action[] = ['project:read', 'site:read', 'camera:read'];
const SURVEY: readonly Action[] = [
  ...READ,
  'project:write',
  'site:write',
  'site:delete',
  'camera:write',
  'camera:delete',
];

/**
 * Engineer: reviews survey data and works on the design — adds and edits
 * camera points (status, direction, FOV, structure; `camera:write` covers
 * both). Cannot delete points or change projects / sites.
 */
const ENGINEER: readonly Action[] = [...READ, 'camera:write'];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Action[]>> = {
  viewer: READ,
  surveyor: SURVEY,
  engineer: ENGINEER,
  admin: ACTIONS,
};

export function can(role: UserRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role].includes(action);
}
