import { Test, TestingModule } from '@nestjs/testing';
import {
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type DatabaseConnection,
  type Driver,
  type QueryResult,
} from 'kysely';
import type { Response } from 'express';
import { AppController } from './app.controller.js';
import {
  AppService,
  DB_CHECK_CACHE_MS,
  DB_CHECK_TIMEOUT_MS,
} from './app.service.js';
import { Database } from './db/database.js';

/** Kysely on a fake driver: every query goes through `query`. */
function fakeDatabase(query: () => Promise<QueryResult<unknown>>) {
  const connection: DatabaseConnection = {
    executeQuery: query as DatabaseConnection['executeQuery'],
    // eslint-disable-next-line require-yield
    async *streamQuery() {
      throw new Error('not used');
    },
  };
  const driver: Driver = {
    init: async () => {},
    acquireConnection: async () => connection,
    beginTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    releaseConnection: async () => {},
    destroy: async () => {},
  };
  return new Database({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => driver,
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });
}

function fakeResponse() {
  const res = { statusCode: 200, status: vi.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  return res;
}

describe('AppController health', () => {
  let query: ReturnType<typeof vi.fn<() => Promise<QueryResult<unknown>>>>;
  let appController: AppController;

  beforeEach(async () => {
    query = vi.fn(async () => ({ rows: [{ '?column?': 1 }] }));
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: Database, useValue: fakeDatabase(() => query()) },
      ],
    }).compile();
    appController = app.get<AppController>(AppController);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function health() {
    const res = fakeResponse();
    const body = await appController.getHealth(res as unknown as Response);
    return { code: res.statusCode, body };
  }

  it('reports ok with 200 when the database answers', async () => {
    const { code, body } = await health();
    expect(code).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      db: 'ok',
      service: 'cctv-survey-api',
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports 503 without leaking the database error', async () => {
    query.mockRejectedValue(
      new Error('password authentication failed for user "cctv_app"'),
    );
    const { code, body } = await health();
    expect(code).toBe(503);
    expect(body).toMatchObject({ status: 'error', db: 'down' });
    expect(JSON.stringify(body)).not.toMatch(/password|cctv_app/);
  });

  it('reports 503 when the database does not answer in time', async () => {
    vi.useFakeTimers();
    query.mockReturnValue(new Promise(() => {}));
    const pending = health();
    await vi.advanceTimersByTimeAsync(DB_CHECK_TIMEOUT_MS);
    const { code, body } = await pending;
    expect(code).toBe(503);
    expect(body.db).toBe('down');
  });

  it('starts no new query while a timed-out one still holds a connection', async () => {
    vi.useFakeTimers();
    let answer!: (r: QueryResult<unknown>) => void;
    query.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const first = health();
    await vi.advanceTimersByTimeAsync(DB_CHECK_TIMEOUT_MS);
    expect((await first).code).toBe(503);
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(DB_CHECK_CACHE_MS + 1);
      expect((await health()).code).toBe(503);
    }
    expect(query).toHaveBeenCalledTimes(1);
    answer({ rows: [] });
    await vi.advanceTimersByTimeAsync(DB_CHECK_CACHE_MS + 1);
    expect((await health()).code).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('shares one query between overlapping and quick repeat calls', async () => {
    vi.useFakeTimers();
    let answer!: (r: QueryResult<unknown>) => void;
    query.mockReturnValue(new Promise((r) => (answer = r)));
    const calls = [health(), health(), health()];
    await vi.advanceTimersByTimeAsync(0);
    answer({ rows: [] });
    for (const { code } of await Promise.all(calls)) expect(code).toBe(200);
    await health();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('checks again once the cached result is old and recovers', async () => {
    vi.useFakeTimers();
    query.mockRejectedValueOnce(new Error('down'));
    expect((await health()).code).toBe(503);
    await vi.advanceTimersByTimeAsync(2001);
    expect((await health()).code).toBe(200);
    expect(query).toHaveBeenCalledTimes(2);
  });
});
