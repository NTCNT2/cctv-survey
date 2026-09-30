import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  ApiError,
  errorMessage,
  logoutEndedSession,
  request,
} from './api';

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      body === undefined
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('calls same-origin /api with the cookie and JSON body', async () => {
    const fetch = mockFetch(201, { id: 'p1' });
    await expect(request('POST', '/projects', { name: 'x' })).resolves.toEqual({
      id: 'p1',
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('/api/projects');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"name":"x"}',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('never sends an Authorization header (the cookie is HttpOnly)', async () => {
    const fetch = mockFetch(200, {});
    await request('GET', '/auth/me');
    expect(JSON.stringify(fetch.mock.calls[0][1])).not.toMatch(
      /authorization/i,
    );
  });

  it('sends no body and no content type for GET/DELETE', async () => {
    const fetch = mockFetch(204);
    await expect(request('DELETE', '/cameras/c1')).resolves.toBeUndefined();
    expect(fetch.mock.calls[0][1]).toMatchObject({
      body: undefined,
      headers: undefined,
    });
  });

  it('turns error responses into ApiError with message and issues', async () => {
    mockFetch(400, {
      statusCode: 400,
      message: 'Validation failed',
      issues: [{ path: 'location.lat', message: 'Too big' }],
    });
    const err = await request('POST', '/projects', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 400,
      message: 'Validation failed',
      issues: [{ path: 'location.lat', message: 'Too big' }],
    });
  });

  it('reports a network failure as status 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(request('GET', '/projects')).rejects.toMatchObject({
      status: 0,
    });
  });

  it('builds list URLs with query parameters', async () => {
    const fetch = mockFetch(200, []);
    await api.projects.list(21, 40);
    expect(fetch.mock.calls[0][0]).toBe('/api/projects?limit=21&offset=40');
  });
});

describe('errorMessage', () => {
  it.each([
    [new ApiError(0, 'network error'), 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'],
    [
      new ApiError(401, 'invalid username or password'),
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    ],
    [new ApiError(403, 'insufficient permissions'), 'ไม่มีสิทธิ์'],
    [new ApiError(404, 'project not found'), 'ไม่พบข้อมูล'],
    [
      new ApiError(
        409,
        'cannot delete: other records still reference it — delete those first',
      ),
      'ลบไม่ได้',
    ],
    [
      new ApiError(
        409,
        'a camera with this label already exists in the project',
      ),
      'มีกล้องที่ใช้ชื่อนี้',
    ],
    [new ApiError(429, 'ThrottlerException: Too Many Requests'), 'บ่อยเกินไป'],
    [new ApiError(500, 'Internal server error'), 'เซิร์ฟเวอร์ขัดข้อง'],
    [new Error('boom'), 'ไม่คาดคิด'],
  ])('%s', (err, text) => {
    expect(errorMessage(err)).toContain(text);
  });
});

describe('logoutEndedSession (L2)', () => {
  it.each([
    ['success', undefined, true],
    ['already signed out (401)', new ApiError(401, 'Unauthorized'), true],
    ['network error', new ApiError(0, 'network error'), false],
    ['server error', new ApiError(500, 'Internal server error'), false],
    ['rate limited', new ApiError(429, 'Too Many Requests'), false],
    ['unexpected error', new Error('boom'), false],
  ])('%s -> %s', (_, err, leave) => {
    expect(logoutEndedSession(err)).toBe(leave);
  });
});
