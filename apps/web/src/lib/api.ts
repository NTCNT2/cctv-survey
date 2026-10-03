import type {
  AuthUser,
  CameraPoint,
  ChangePasswordInput,
  CreateCameraPointInput,
  CreateProjectInput,
  CreateSiteInput,
  LoginInput,
  LoginResponse,
  Project,
  Site,
  UpdateCameraPointInput,
  UpdateProjectInput,
  UpdateSiteInput,
} from '@cctv/shared';

export interface ApiIssue {
  path: string;
  message: string;
}

/** A non-2xx response from the API (or a network failure, status 0). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: ApiIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * All calls go to same-origin `/api/*` (rewritten to the API by Next.js). The
 * browser attaches the HttpOnly session cookie itself; this code never sees it.
 */
export async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network error');
  }
  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const d = (data ?? {}) as { message?: unknown; issues?: unknown };
    const message =
      typeof d.message === 'string'
        ? d.message
        : Array.isArray(d.message)
          ? d.message.join(', ')
          : res.statusText;
    const issues = Array.isArray(d.issues) ? (d.issues as ApiIssue[]) : [];
    throw new ApiError(res.status, message, issues);
  }
  return data as T;
}

const q = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) s.set(k, String(v));
  }
  const str = s.toString();
  return str ? `?${str}` : '';
};

export const api = {
  auth: {
    me: () => request<AuthUser>('GET', '/auth/me'),
    login: (body: LoginInput) =>
      request<LoginResponse>('POST', '/auth/login', body),
    logout: () => request<void>('POST', '/auth/logout'),
    changePassword: (body: ChangePasswordInput) =>
      request<void>('POST', '/auth/change-password', body),
  },
  projects: {
    list: (limit: number, offset: number) =>
      request<Project[]>('GET', `/projects${q({ limit, offset })}`),
    get: (id: string) => request<Project>('GET', `/projects/${id}`),
    create: (body: CreateProjectInput) =>
      request<Project>('POST', '/projects', body),
    update: (id: string, body: UpdateProjectInput) =>
      request<Project>('PATCH', `/projects/${id}`, body),
    remove: (id: string) => request<void>('DELETE', `/projects/${id}`),
  },
  sites: {
    list: (projectId: string) =>
      request<Site[]>('GET', `/projects/${projectId}/sites`),
    get: (id: string) => request<Site>('GET', `/sites/${id}`),
    create: (body: CreateSiteInput) => request<Site>('POST', '/sites', body),
    update: (id: string, body: UpdateSiteInput) =>
      request<Site>('PATCH', `/sites/${id}`, body),
    remove: (id: string) => request<void>('DELETE', `/sites/${id}`),
  },
  cameras: {
    list: (projectId: string) =>
      request<CameraPoint[]>('GET', `/projects/${projectId}/cameras`),
    get: (id: string) => request<CameraPoint>('GET', `/cameras/${id}`),
    create: (body: CreateCameraPointInput) =>
      request<CameraPoint>('POST', '/cameras', body),
    update: (id: string, body: UpdateCameraPointInput) =>
      request<CameraPoint>('PATCH', `/cameras/${id}`, body),
    remove: (id: string) => request<void>('DELETE', `/cameras/${id}`),
  },
};

/** API messages that deserve a specific Thai explanation. */
const KNOWN_MESSAGES: Record<string, string> = {
  'invalid username or password': 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
  'current password is incorrect': 'รหัสผ่านปัจจุบันไม่ถูกต้อง',
  'password must not equal the username': 'รหัสผ่านต้องไม่เหมือนชื่อผู้ใช้',
  'a site with this name already exists in the project':
    'มี Site ชื่อนี้ในโครงการแล้ว',
  'a camera with this label already exists in the project':
    'มีกล้องที่ใช้ชื่อนี้ในโครงการแล้ว',
  'siteId does not exist in this project': 'Site ที่เลือกไม่อยู่ในโครงการนี้',
  'projectId does not exist': 'ไม่พบโครงการนี้',
  'boundary polygon is invalid (self-intersecting or degenerate)':
    'ขอบเขตพื้นที่ไม่ถูกต้อง',
};

/** A user-facing Thai message for any error thrown by `request`. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'เกิดข้อผิดพลาดที่ไม่คาดคิด';
  if (KNOWN_MESSAGES[err.message]) return KNOWN_MESSAGES[err.message];
  if (err.message.startsWith('cannot delete')) {
    return 'ลบไม่ได้ เพราะยังมีข้อมูลที่ผูกอยู่ (เช่น Site หรือกล้อง) — ลบรายการเหล่านั้นก่อน';
  }
  switch (err.status) {
    case 0:
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่';
    case 400:
      return 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง';
    case 401:
      return 'กรุณาเข้าสู่ระบบ';
    case 403:
      return 'คุณไม่มีสิทธิ์ทำรายการนี้';
    case 404:
      return 'ไม่พบข้อมูล';
    case 409:
      return 'ข้อมูลซ้ำหรือขัดแย้งกับข้อมูลที่มีอยู่';
    case 415:
      return 'รูปแบบคำขอไม่ถูกต้อง';
    case 429:
      return 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่';
    default:
      return err.status >= 500
        ? 'เซิร์ฟเวอร์ขัดข้อง กรุณาลองใหม่ภายหลัง'
        : 'เกิดข้อผิดพลาด';
  }
}

/**
 * After POST /auth/logout: may the UI treat the user as signed out? Only if
 * the call succeeded (`err` undefined) or the API says there is no session
 * (401). A network or server error means the session may still be valid, so
 * the user must not be shown the login page as if they had signed out.
 */
export function logoutEndedSession(err?: unknown): boolean {
  return err === undefined || (err instanceof ApiError && err.status === 401);
}
