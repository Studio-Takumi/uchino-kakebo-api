import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error, json } from '../lib/response';
import { getSupabase, getUserId } from '../lib/supabase';
import { escapeLike, parseExpensesQuery } from './expensesQuery';

const COLUMNS =
  'id, date, expenses, title, emoji, method_id, category_id, comment, created_time, last_edited_time';

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
 *
 * Parsing/validation lives in ./expensesQuery (pure, unit-tested).
 */
export const getExpenses = async (
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const parsed = parseExpensesQuery(event.queryStringParameters ?? null);
  if (!parsed.ok) {
    return error(400, 'BAD_REQUEST', parsed.message);
  }
  const p = parsed.value;

  let query = getSupabase()
    .from('expenses')
    .select(COLUMNS)
    .eq('user_id', getUserId());

  if (p.from !== undefined) query = query.gte('date', p.from);
  if (p.to !== undefined) query = query.lte('date', p.to);
  if (p.min !== undefined) query = query.gte('expenses', p.min);
  if (p.max !== undefined) query = query.lte('expenses', p.max);
  if (p.methodId !== undefined) query = query.eq('method_id', p.methodId);
  if (p.categoryId !== undefined) query = query.eq('category_id', p.categoryId);
  if (p.title !== undefined) query = query.ilike('title', `%${escapeLike(p.title)}%`);

  // nullsFirst:false so a dirty null (e.g. a null expenses amount) never floats
  // to the top of a desc sort — nulls always sort last, both directions.
  query = query.order(p.order.column, { ascending: p.order.ascending, nullsFirst: false });
  // Stable tiebreaker when the primary sort isn't the date itself.
  if (p.order.column !== 'date') {
    query = query.order('date', { ascending: false, nullsFirst: false });
  }
  query = query.limit(p.limit);

  const { data, error: dbError } = await query;
  if (dbError) {
    console.error('GET /expenses db error:', dbError);
    return error(500, 'INTERNAL_ERROR', 'Failed to fetch expenses');
  }

  return json(200, data ?? []);
};
