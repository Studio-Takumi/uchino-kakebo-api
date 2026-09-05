import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error, json } from '../lib/response';
import { getSupabase, getUserId } from '../lib/supabase';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

// Columns the caller is allowed to sort by (allowlist — never pass raw input as
// a column name).
const ORDERABLE = new Set(['date', 'expenses']);

const COLUMNS =
  'id, date, expenses, title, emoji, method_id, category_id, comment, created_time, last_edited_time';

// Strict YYYY-MM-DD that also rejects impossible dates (e.g. 2026-02-31).
const isValidDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

/**
 * GET /expenses
 *
 * List expenses for the user. Serves both dedupe (date range) and the
 * classification-context reads (recent, ordered).
 *
 * Query params (all optional):
 *   - from, to         date range on `date` (YYYY-MM-DD, inclusive)
 *   - min, max         expenses amount range (integer >= 0, inclusive)
 *   - title            case-insensitive substring match on title
 *   - method_id        filter by method
 *   - category_id      filter by category
 *   - order            '<date|expenses>.<asc|desc>' (default 'date.desc')
 *   - limit            default 200, cap 1000
 */
export const getExpenses = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const qs = event.queryStringParameters ?? {};

  const from = qs.from ?? undefined;
  const to = qs.to ?? undefined;
  const methodId = qs.method_id ?? undefined;
  const categoryId = qs.category_id ?? undefined;
  const title = qs.title ?? undefined;
  const orderParam = qs.order ?? 'date.desc';
  const limitParam = qs.limit ?? undefined;
  const minParam = qs.min ?? undefined;
  const maxParam = qs.max ?? undefined;

  if (from !== undefined && !isValidDate(from)) {
    return error(400, 'BAD_REQUEST', "'from' must be a valid YYYY-MM-DD date");
  }
  if (to !== undefined && !isValidDate(to)) {
    return error(400, 'BAD_REQUEST', "'to' must be a valid YYYY-MM-DD date");
  }

  // order: "<column>.<direction>", column allowlisted.
  const [orderCol, orderDir] = orderParam.split('.');
  if (!ORDERABLE.has(orderCol) || (orderDir !== 'asc' && orderDir !== 'desc')) {
    return error(400, 'BAD_REQUEST', "'order' must be '<date|expenses>.<asc|desc>'");
  }

  // min / max: expenses amount range.
  let min: number | undefined;
  if (minParam !== undefined) {
    const n = Number(minParam);
    if (!Number.isInteger(n) || n < 0) {
      return error(400, 'BAD_REQUEST', "'min' must be an integer >= 0");
    }
    min = n;
  }
  let max: number | undefined;
  if (maxParam !== undefined) {
    const n = Number(maxParam);
    if (!Number.isInteger(n) || n < 0) {
      return error(400, 'BAD_REQUEST', "'max' must be an integer >= 0");
    }
    max = n;
  }
  if (min !== undefined && max !== undefined && min > max) {
    return error(400, 'BAD_REQUEST', "'min' must be <= 'max'");
  }

  let limit = DEFAULT_LIMIT;
  if (limitParam !== undefined) {
    const n = Number(limitParam);
    if (!Number.isInteger(n) || n < 1) {
      return error(400, 'BAD_REQUEST', "'limit' must be a positive integer");
    }
    limit = Math.min(n, MAX_LIMIT);
  }

  let query = getSupabase()
    .from('expenses')
    .select(COLUMNS)
    .eq('user_id', getUserId());

  if (from !== undefined) query = query.gte('date', from);
  if (to !== undefined) query = query.lte('date', to);
  if (min !== undefined) query = query.gte('expenses', min);
  if (max !== undefined) query = query.lte('expenses', max);
  if (methodId !== undefined) query = query.eq('method_id', methodId);
  if (categoryId !== undefined) query = query.eq('category_id', categoryId);
  if (title !== undefined && title !== '') {
    // Escape ilike wildcards so the input is matched literally as a substring.
    const escaped = title.replace(/[\\%_]/g, (c) => `\\${c}`);
    query = query.ilike('title', `%${escaped}%`);
  }

  // nullsFirst:false so a dirty null (e.g. a null expenses amount) never floats
  // to the top of a desc sort — nulls always sort last, both directions.
  query = query.order(orderCol, { ascending: orderDir === 'asc', nullsFirst: false });
  // Stable tiebreaker when the primary sort isn't the date itself.
  if (orderCol !== 'date') query = query.order('date', { ascending: false, nullsFirst: false });
  query = query.limit(limit);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('GET /expenses db error:', dbError);
    return error(500, 'INTERNAL_ERROR', 'Failed to fetch expenses');
  }

  return json(200, data ?? []);
};
