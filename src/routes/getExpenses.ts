import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { notImplemented } from '../lib/response';

/**
 * GET /expenses
 *
 * List expenses for the user. Serves both dedupe (date range) and the
 * classification-context reads (recent, ordered).
 *
 * Query params (all optional), from event.queryStringParameters:
 *   - from        date >= from  (inclusive, YYYY-MM-DD)
 *   - to          date <= to    (inclusive, YYYY-MM-DD)
 *   - method_id   filter by method
 *   - category_id filter by category
 *   - order       'date.desc' (default) | 'date.asc'
 *   - limit       max rows, default 200, hard cap 1000
 *
 * TODO (implementation):
 *   - Validate params (limit numeric & clamped; order in the allowed set;
 *     from/to well-formed dates).
 *   - Build supabase query on 'expenses' with .eq('user_id', getUserId()),
 *     conditional .gte/.lte/.eq, .order('date', ...), .limit(...).
 *   - 200 with the array, 400 on bad params, 500 on db error.
 */
export const getExpenses = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return notImplemented('GET /expenses');
};
