import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  escapeLike,
  isValidDate,
  parseExpensesQuery,
} from '../src/routes/expensesQuery';

const ok = (qs: Record<string, string | undefined> | null) => {
  const r = parseExpensesQuery(qs);
  if (!r.ok) throw new Error(`expected ok, got error: ${r.message}`);
  return r.value;
};
const err = (qs: Record<string, string | undefined> | null) => {
  const r = parseExpensesQuery(qs);
  if (r.ok) throw new Error('expected error, got ok');
  return r.message;
};

describe('isValidDate', () => {
  it('accepts a real date', () => expect(isValidDate('2026-08-15')).toBe(true));
  it('rejects an impossible day', () => expect(isValidDate('2026-02-31')).toBe(false));
  it('rejects an impossible month', () => expect(isValidDate('2026-13-01')).toBe(false));
  it('rejects a non-padded format', () => expect(isValidDate('2026-8-1')).toBe(false));
  it('rejects garbage', () => expect(isValidDate('yesterday')).toBe(false));
});

describe('escapeLike', () => {
  it('escapes % _ and backslash', () =>
    expect(escapeLike('a%b_c\\d')).toBe('a\\%b\\_c\\\\d'));
  it('leaves ordinary text untouched', () =>
    expect(escapeLike('セブン-イレブン')).toBe('セブン-イレブン'));
});

describe('parseExpensesQuery — defaults', () => {
  it('empty query → date.desc, default limit, no filters', () => {
    expect(ok({})).toEqual({
      from: undefined,
      to: undefined,
      min: undefined,
      max: undefined,
      title: undefined,
      methodId: undefined,
      categoryId: undefined,
      order: { column: 'date', ascending: false },
      limit: DEFAULT_LIMIT,
    });
  });
  it('null query behaves like empty', () => {
    expect(ok(null).order).toEqual({ column: 'date', ascending: false });
  });
  it('empty title string is treated as no filter', () => {
    expect(ok({ title: '' }).title).toBeUndefined();
  });
});

describe('parseExpensesQuery — order', () => {
  it('date.asc', () => expect(ok({ order: 'date.asc' }).order).toEqual({ column: 'date', ascending: true }));
  it('expenses.desc', () =>
    expect(ok({ order: 'expenses.desc' }).order).toEqual({ column: 'expenses', ascending: false }));
  it('rejects a non-allowlisted column', () => expect(err({ order: 'title.asc' })).toMatch(/order/));
  it('rejects a missing direction', () => expect(err({ order: 'date' })).toMatch(/order/));
  it('rejects an unknown column', () => expect(err({ order: 'foo.asc' })).toMatch(/order/));
});

describe('parseExpensesQuery — dates', () => {
  it('accepts valid from/to', () => {
    const v = ok({ from: '2026-08-01', to: '2026-08-31' });
    expect([v.from, v.to]).toEqual(['2026-08-01', '2026-08-31']);
  });
  it('rejects invalid from', () => expect(err({ from: '2026-13-40' })).toMatch(/from/));
  it('rejects invalid to', () => expect(err({ to: 'nope' })).toMatch(/to/));
});

describe('parseExpensesQuery — min/max', () => {
  it('accepts a range', () => {
    const v = ok({ min: '1000', max: '5000' });
    expect([v.min, v.max]).toEqual([1000, 5000]);
  });
  it('accepts zero', () => expect(ok({ min: '0' }).min).toBe(0));
  it('rejects negative', () => expect(err({ min: '-1' })).toMatch(/min/));
  it('rejects non-integer', () => expect(err({ max: 'abc' })).toMatch(/max/));
  it('rejects min > max', () => expect(err({ min: '5000', max: '1000' })).toMatch(/min.*<=.*max/));
});

describe('parseExpensesQuery — limit', () => {
  it('defaults to 200', () => expect(ok({}).limit).toBe(DEFAULT_LIMIT));
  it('uses a provided value', () => expect(ok({ limit: '5' }).limit).toBe(5));
  it('clamps above the cap', () => expect(ok({ limit: '5000' }).limit).toBe(MAX_LIMIT));
  it('rejects zero', () => expect(err({ limit: '0' })).toMatch(/limit/));
  it('rejects negative', () => expect(err({ limit: '-3' })).toMatch(/limit/));
  it('rejects non-integer', () => expect(err({ limit: '1.5' })).toMatch(/limit/));
});

describe('parseExpensesQuery — passthrough filters', () => {
  it('keeps title / method_id / category_id', () => {
    const v = ok({ title: 'セブン', method_id: 'm1', category_id: 'c1' });
    expect([v.title, v.methodId, v.categoryId]).toEqual(['セブン', 'm1', 'c1']);
  });
});
