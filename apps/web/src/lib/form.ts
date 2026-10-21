import type { z } from 'zod';
import type { ApiIssue } from './api';

/** Field name → first error message. Keys are the top-level form field. */
export type FieldErrors = Record<string, string>;

/** zod issue paths like `location.lat` are reported on the `location` field. */
export function issuesToFieldErrors(
  issues: readonly { path: readonly PropertyKey[] | string; message: string }[],
): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const path =
      typeof issue.path === 'string'
        ? issue.path.split('.')
        : issue.path.map(String);
    const key = path[0] || '_form';
    out[key] ??= issue.message;
  }
  return out;
}

export function apiIssuesToFieldErrors(issues: ApiIssue[]): FieldErrors {
  const errors = issuesToFieldErrors(issues);
  for (const [k, v] of Object.entries(errors))
    errors[k] = SCHEMA_MESSAGES[v] ?? v;
  return errors;
}

/** Custom (English) messages defined in packages/shared schemas. */
const SCHEMA_MESSAGES: Record<string, string> = {
  'at least one field is required': 'กรุณาแก้ไขอย่างน้อยหนึ่งช่อง',
  'type is required without cameraModelId':
    'กรุณาเลือกรุ่นกล้อง หรือระบุประเภทกล้อง',
  'password must be at least 12 characters':
    'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร',
  'password must be at most 128 characters': 'รหัสผ่านต้องไม่เกิน 128 ตัวอักษร',
  'password must not equal the username': 'รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้',
  'new password must differ from the current one':
    'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน',
};

interface IssueLike {
  code?: string;
  origin?: string;
  minimum?: unknown;
  maximum?: unknown;
  inclusive?: boolean;
  expected?: string;
  received?: string;
  input?: unknown;
}

/** Thai messages for zod's built-in checks (used for every client-side parse). */
export function thaiIssueMessage(iss: IssueLike): string | undefined {
  switch (iss.code) {
    case 'invalid_type':
      if (iss.input === undefined || iss.input === null)
        return 'กรุณากรอกข้อมูล';
      return iss.expected === 'number'
        ? 'ต้องเป็นตัวเลข'
        : 'รูปแบบข้อมูลไม่ถูกต้อง';
    case 'too_small':
      if (iss.origin === 'string') {
        return Number(iss.minimum) <= 1
          ? 'กรุณากรอกข้อมูล'
          : `ต้องมีอย่างน้อย ${String(iss.minimum)} ตัวอักษร`;
      }
      if (iss.origin === 'array')
        return `ต้องมีอย่างน้อย ${String(iss.minimum)} จุด`;
      return iss.inclusive === false
        ? `ต้องมากกว่า ${String(iss.minimum)}`
        : `ต้องไม่น้อยกว่า ${String(iss.minimum)}`;
    case 'too_big':
      if (iss.origin === 'string')
        return `ต้องไม่เกิน ${String(iss.maximum)} ตัวอักษร`;
      if (iss.origin === 'array')
        return `ต้องไม่เกิน ${String(iss.maximum)} จุด`;
      return iss.inclusive === false
        ? `ต้องน้อยกว่า ${String(iss.maximum)}`
        : `ต้องไม่เกิน ${String(iss.maximum)}`;
    case 'invalid_value':
      return 'กรุณาเลือกจากรายการ';
    case 'invalid_format':
      return 'รูปแบบข้อมูลไม่ถูกต้อง';
    default:
      return undefined;
  }
}

/**
 * Validates `value` with a shared zod schema — the same one the API uses.
 * Returns the parsed data, or Thai field errors to show next to the inputs.
 */
export function validate<S extends z.ZodType>(
  schema: S,
  value: unknown,
):
  | { data: z.output<S>; errors?: undefined }
  | { data?: undefined; errors: FieldErrors } {
  const r = schema.safeParse(value, { error: thaiIssueMessage });
  if (r.success) return { data: r.data };
  const errors = issuesToFieldErrors(r.error.issues);
  for (const [k, v] of Object.entries(errors))
    errors[k] = SCHEMA_MESSAGES[v] ?? v;
  return { errors };
}

/** Text input → trimmed string, or `empty` when blank. */
export function text<E extends undefined | null>(
  value: string,
  empty: E,
): string | E {
  const t = value.trim();
  return t === '' ? empty : t;
}

/**
 * Numeric text input (accepts a comma as decimal separator) → number,
 * `empty` when blank, or NaN when it is not a number (zod then rejects it).
 */
export function num<E extends undefined | null>(
  value: string,
  empty: E,
): number | E {
  const t = value.trim().replace(',', '.');
  if (t === '') return empty;
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** Where the app starts after login. */
export const HOME_PATH = '/dashboard';

/**
 * Only same-origin, absolute paths are allowed as a post-login destination.
 * Blocks `//evil.example`, `/\evil.example`, `https://…` and the like.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return HOME_PATH;
  }
  if (next.includes('\\') || /[\u0000-\u001f]/.test(next)) return HOME_PATH;
  if (next.startsWith('/login')) return HOME_PATH;
  return next;
}

/** Splits an error from a submit into per-field messages and a form message. */
export function submitErrors(
  err: unknown,
  describe: (err: unknown) => string,
): { fields: FieldErrors; message: string } {
  const issues =
    typeof err === 'object' && err !== null && 'issues' in err
      ? (err as { issues: ApiIssue[] }).issues
      : [];
  return { fields: apiIssuesToFieldErrors(issues), message: describe(err) };
}
