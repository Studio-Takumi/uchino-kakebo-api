// Integration tests for GET /expenses against a REAL local Supabase
// (Postgres + PostgREST). These exercise the query combinations that only the
// database can validate faithfully (ilike, nulls-last ordering, ranges).
//
// Run:
//   1. install Docker + the Supabase CLI
//   2. `supabase start` then `supabase db reset` (applies migrations + seed)
//   3. `npm run test:db`
//
// Gated on RUN_DB_TESTS=1 so the default `npm test` (unit only) stays green
// without Docker. Local URL / demo service_role key / seed user id are the
// Supabase CLI defaults and can be overridden via env.

// Set before importing the handler (getSupabase reads env lazily on first call).
process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UtZGVtbyIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.DaYlNEoUrrEn2Ig7tqibS-PHK5vgusbcbo7X36XVt4Q';
process.env.USER_ID ??= '00000000-0000-0000-0000-000000000001';

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it } from 'vitest';
import { getExpenses } from '../src/routes/getExpenses';

const RUN = process.env.RUN_DB_TESTS === '1';

const CATEGORY_FOOD = '00000000-0000-0000-0000-0000000000b1';
const METHOD_PAYPAY = '00000000-0000-0000-0000-0000000000a2';

type Row = {
  id: string;
  date: string;
  expenses: number | null;
  title: string;
  method_id: string;
  category_id: string;
};

const call = async (
  query: Record<string, string> | null,
): Promise<{ status: number; body: unknown }> => {
  const event = { queryStringParameters: query } as unknown as APIGatewayProxyEvent;
  const res = await getExpenses(event);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

const rows = async (query: Record<string, string> | null): Promise<Row[]> => {
  const { status, body } = await call(query);
  expect(status).toBe(200);
  return body as Row[];
};

describe.skipIf(!RUN)('GET /expenses (integration)', () => {
  // Fail loudly (rather than silently pass) if the DB isn't seeded as expected.
  beforeEach(async () => {
    const all = await rows({});
    expect(all.length, 'seed not loaded — run `supabase db reset`').toBe(16);
  });

  it('returns all 16 seeded rows by default', async () => {
    expect((await rows({})).length).toBe(16);
  });

  describe('date range', () => {
    it('filters to July (5 rows)', async () => {
      expect((await rows({ from: '2026-07-01', to: '2026-07-31' })).length).toBe(5);
    });
    it('filters to August (8 rows)', async () => {
      expect((await rows({ from: '2026-08-01', to: '2026-08-31' })).length).toBe(8);
    });
  });

  describe('amount range', () => {
    it('min=1000 → 8 rows (null excluded)', async () => {
      const r = await rows({ min: '1000' });
      expect(r.length).toBe(8);
      expect(r.every((x) => (x.expenses ?? -1) >= 1000)).toBe(true);
    });
    it('min=1000&max=3000 → 6 rows', async () => {
      expect((await rows({ min: '1000', max: '3000' })).length).toBe(6);
    });
  });

  describe('title (case-insensitive substring, wildcards escaped)', () => {
    it('セブン → 2 rows', async () => {
      expect((await rows({ title: 'セブン' })).length).toBe(2);
    });
    it('amazon matches Amazon and amazonギフト (2 rows, ci)', async () => {
      expect((await rows({ title: 'amazon' })).length).toBe(2);
    });
    it("literal '%' matches only the title containing it (1 row)", async () => {
      expect((await rows({ title: '%' })).length).toBe(1);
    });
    it("literal '_' matches only the title containing it (1 row)", async () => {
      expect((await rows({ title: '_' })).length).toBe(1);
    });
  });

  describe('column filters', () => {
    it('category_id = 食費 → 8 rows', async () => {
      expect((await rows({ category_id: CATEGORY_FOOD })).length).toBe(8);
    });
    it('method_id = PayPay → 9 rows', async () => {
      expect((await rows({ method_id: METHOD_PAYPAY })).length).toBe(9);
    });
  });

  describe('order + nulls-last', () => {
    it('expenses.desc: first is 50000, null sorts last', async () => {
      const r = await rows({ order: 'expenses.desc' });
      expect(r[0].expenses).toBe(50000);
      expect(r[r.length - 1].expenses).toBeNull();
      const nonNull = r.map((x) => x.expenses).filter((v): v is number => v !== null);
      expect(nonNull).toEqual([...nonNull].sort((a, b) => b - a));
    });
    it('expenses.asc: first is 0, null still sorts last', async () => {
      const r = await rows({ order: 'expenses.asc' });
      expect(r[0].expenses).toBe(0);
      expect(r[r.length - 1].expenses).toBeNull();
      const nonNull = r.map((x) => x.expenses).filter((v): v is number => v !== null);
      expect(nonNull).toEqual([...nonNull].sort((a, b) => a - b));
    });
    it('date.desc (default) is non-increasing by date', async () => {
      const r = await rows({});
      const dates = r.map((x) => x.date);
      expect(dates).toEqual([...dates].sort().reverse());
    });
  });

  describe('limit', () => {
    it('limit=5 caps the result', async () => {
      expect((await rows({ limit: '5' })).length).toBe(5);
    });
  });

  describe('combined filters', () => {
    it('August + min=1000 + expenses.desc', async () => {
      const r = await rows({ from: '2026-08-01', to: '2026-08-31', min: '1000', order: 'expenses.desc' });
      expect(r.every((x) => (x.expenses ?? -1) >= 1000)).toBe(true);
      const amts = r.map((x) => x.expenses as number);
      expect(amts).toEqual([...amts].sort((a, b) => b - a));
    });
  });

  describe('validation (400)', () => {
    it('rejects a bad order column', async () => {
      expect((await call({ order: 'title.asc' })).status).toBe(400);
    });
    it('rejects min > max', async () => {
      expect((await call({ min: '5000', max: '1000' })).status).toBe(400);
    });
    it('rejects a bad date', async () => {
      expect((await call({ from: '2026-13-40' })).status).toBe(400);
    });
  });
});
