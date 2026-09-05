// Pure parsing + validation for the GET /expenses query string.
// Kept free of any I/O so it can be unit-tested without a database.

export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 1000;

// Columns the caller is allowed to sort by (allowlist — never pass raw input as
// a column name).
const ORDERABLE = new Set(['date', 'expenses']);

export type OrderColumn = 'date' | 'expenses';

export type ParsedExpensesQuery = {
  from?: string;
  to?: string;
  min?: number;
  max?: number;
  title?: string;
  methodId?: string;
  categoryId?: string;
  order: { column: OrderColumn; ascending: boolean };
  limit: number;
};

export type ParseResult =
  | { ok: true; value: ParsedExpensesQuery }
  | { ok: false; message: string };

// Strict YYYY-MM-DD that also rejects impossible dates (e.g. 2026-02-31).
export const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

// Escape ilike wildcards so caller input is matched literally as a substring.
export const escapeLike = (input: string): string =>
  input.replace(/[\\%_]/g, (c) => `\\${c}`);

const parseAmount = (raw: string, field: 'min' | 'max'): number | { message: string } => {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    return { message: `'${field}' must be an integer >= 0` };
  }
  return n;
};

export const parseExpensesQuery = (
  qs: Record<string, string | undefined> | null,
): ParseResult => {
  const q = qs ?? {};

  const from = q.from ?? undefined;
  const to = q.to ?? undefined;
  const title = q.title ?? undefined;
  const methodId = q.method_id ?? undefined;
  const categoryId = q.category_id ?? undefined;
  const orderParam = q.order ?? 'date.desc';

  if (from !== undefined && !isValidDate(from)) {
    return { ok: false, message: "'from' must be a valid YYYY-MM-DD date" };
  }
  if (to !== undefined && !isValidDate(to)) {
    return { ok: false, message: "'to' must be a valid YYYY-MM-DD date" };
  }

  // order: "<column>.<direction>", column allowlisted.
  const [orderCol, orderDir] = orderParam.split('.');
  if (!ORDERABLE.has(orderCol) || (orderDir !== 'asc' && orderDir !== 'desc')) {
    return { ok: false, message: "'order' must be '<date|expenses>.<asc|desc>'" };
  }

  let min: number | undefined;
  if (q.min !== undefined) {
    const r = parseAmount(q.min, 'min');
    if (typeof r !== 'number') return { ok: false, message: r.message };
    min = r;
  }
  let max: number | undefined;
  if (q.max !== undefined) {
    const r = parseAmount(q.max, 'max');
    if (typeof r !== 'number') return { ok: false, message: r.message };
    max = r;
  }
  if (min !== undefined && max !== undefined && min > max) {
    return { ok: false, message: "'min' must be <= 'max'" };
  }

  let limit = DEFAULT_LIMIT;
  if (q.limit !== undefined) {
    const n = Number(q.limit);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, message: "'limit' must be a positive integer" };
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  return {
    ok: true,
    value: {
      from,
      to,
      min,
      max,
      title: title !== undefined && title !== '' ? title : undefined,
      methodId,
      categoryId,
      order: { column: orderCol as OrderColumn, ascending: orderDir === 'asc' },
      limit,
    },
  };
};
