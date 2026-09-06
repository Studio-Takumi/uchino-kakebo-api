// Integration tests for POST /expenses against a REAL local Supabase.
// Writes rows, then deletes them in afterEach so the seed's 16-row invariant is
// preserved (GET tests assert on it). Never run against production.
//
// Run: `supabase start` → `supabase db reset` → `npm run test:db`.
// Gated on RUN_DB_TESTS=1 (see getExpenses.int.test.ts for env defaults).

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
process.env.USER_ID ??= '00000000-0000-0000-0000-000000000001';

import type { APIGatewayProxyEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getSupabase, getUserId } from '../src/lib/supabase';
import { postExpenses } from '../src/routes/postExpenses';

const RUN = process.env.RUN_DB_TESTS === '1';

const METHOD_CASH = '00000000-0000-0000-0000-0000000000a1';
const CATEGORY_FOOD = '00000000-0000-0000-0000-0000000000b1'; // default emoji 🍚
const MISSING_UUID = '00000000-0000-0000-0000-0000000000ff';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validItem = (over: Record<string, unknown> = {}) => ({
  date: '2026-09-01',
  expenses: 1234,
  title: 'テスト支出',
  method_id: METHOD_CASH,
  category_id: CATEGORY_FOOD,
  ...over,
});

const inserted: string[] = [];

const callRaw = async (bodyStr: string | null) => {
  const event = { body: bodyStr } as unknown as APIGatewayProxyEvent;
  const res = await postExpenses(event);
  return { status: res.statusCode, body: JSON.parse(res.body) as any };
};
const post = async (items: unknown) => {
  const r = await callRaw(JSON.stringify(items));
  if (r.status === 201) for (const it of r.body.items) inserted.push(it.id);
  return r;
};
const count = async (): Promise<number> => {
  const { count } = await getSupabase()
    .from('expenses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', getUserId());
  return count ?? -1;
};

describe.skipIf(!RUN)('POST /expenses (integration)', () => {
  beforeEach(async () => {
    expect(await count(), 'seed not loaded — run `supabase db reset`').toBe(16);
  });
  afterEach(async () => {
    if (inserted.length) {
      await getSupabase().from('expenses').delete().in('id', inserted);
      inserted.length = 0;
    }
  });

  describe('happy path', () => {
    it('inserts one row (201) and reports it', async () => {
      const r = await post([validItem()]);
      expect(r.status).toBe(201);
      expect(r.body.inserted).toBe(1);
      expect(await count()).toBe(17);
    });

    it('server generates id / timestamps (client id ignored)', async () => {
      const r = await post([validItem({ id: 'client-supplied-id' })]);
      const row = r.body.items[0];
      expect(row.id).toMatch(UUID_RE);
      expect(row.id).not.toBe('client-supplied-id');
      expect(new Date(row.created_time).getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect(new Date(row.last_edited_time).getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it("emoji defaults to the category's emoji when omitted", async () => {
      const r = await post([validItem()]);
      expect(r.body.items[0].emoji).toBe('🍚');
    });
    it('emoji is used when provided', async () => {
      const r = await post([validItem({ emoji: '🎯' })]);
      expect(r.body.items[0].emoji).toBe('🎯');
    });
    it('comment defaults to empty string', async () => {
      const r = await post([validItem()]);
      expect(r.body.items[0].comment).toBe('');
    });

    it('inserts a batch atomically', async () => {
      const r = await post([validItem(), validItem({ title: '2件目', expenses: 500 })]);
      expect(r.body.inserted).toBe(2);
      expect(await count()).toBe(18);
    });
  });

  describe('validation is atomic — nothing is inserted on any error', () => {
    it('negative expenses → 400', async () => {
      expect((await post([validItem({ expenses: -1 })])).status).toBe(400);
      expect(await count()).toBe(16);
    });
    it('bad date → 400', async () => {
      expect((await post([validItem({ date: '2026-13-40' })])).status).toBe(400);
      expect(await count()).toBe(16);
    });
    it('non-string title → 400', async () => {
      expect((await post([validItem({ title: 123 })])).status).toBe(400);
      expect(await count()).toBe(16);
    });
    it('non-integer expenses → 400', async () => {
      expect((await post([validItem({ expenses: 12.5 })])).status).toBe(400);
      expect(await count()).toBe(16);
    });
    it('unknown method_id → 400', async () => {
      expect((await post([validItem({ method_id: MISSING_UUID })])).status).toBe(400);
      expect(await count()).toBe(16);
    });
    it('unknown category_id → 400', async () => {
      expect((await post([validItem({ category_id: MISSING_UUID })])).status).toBe(400);
      expect(await count()).toBe(16);
    });
    it('one bad item in a batch rolls back the whole batch', async () => {
      const r = await post([validItem(), validItem({ expenses: -5 })]);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(await count()).toBe(16); // the valid sibling was NOT inserted
    });
    it('reports per-item details with index and field', async () => {
      const r = await post([validItem(), validItem({ expenses: -5, date: 'bad' })]);
      const details = r.body.error.details as Array<{ index: number; field: string }>;
      expect(details.every((d) => d.index === 1)).toBe(true);
      expect(details.map((d) => d.field).sort()).toEqual(['date', 'expenses']);
    });
  });

  describe('empty title is allowed but warned', () => {
    it('inserts an empty-title row (201) and returns a warning', async () => {
      const r = await post([validItem({ title: '' })]);
      expect(r.status).toBe(201);
      expect(r.body.inserted).toBe(1);
      expect(r.body.items[0].title).toBe('');
      expect(await count()).toBe(17);
      const w = r.body.warnings as Array<{ index: number; field: string; message: string }>;
      expect(w).toHaveLength(1);
      expect(w[0]).toMatchObject({ index: 0, field: 'title' });
    });
    it('no warnings when the title is non-empty', async () => {
      const r = await post([validItem()]);
      expect(r.body.warnings).toEqual([]);
    });
  });

  describe('body shape', () => {
    it('empty array → 400', async () => {
      expect((await post([])).status).toBe(400);
    });
    it('non-array body → 400', async () => {
      expect((await callRaw(JSON.stringify({ not: 'an array' }))).status).toBe(400);
    });
    it('invalid JSON → 400', async () => {
      expect((await callRaw('{')).status).toBe(400);
    });
    it('missing body → 400', async () => {
      expect((await callRaw(null)).status).toBe(400);
    });
  });
});
