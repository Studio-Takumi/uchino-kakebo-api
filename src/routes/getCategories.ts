import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { notImplemented } from '../lib/response';

/**
 * GET /categories
 *
 * Return the user's categories ordered by priority asc, including the default
 * emoji, default method_id and is_income flag.
 *
 * TODO (implementation):
 *   - supabase.from('categories')
 *       .select('category_id, category, color, priority, emoji, method_id, is_income')
 *       .eq('user_id', getUserId()).order('priority', { ascending: true })
 *   - 200 with the array, or 500 on db error.
 */
export const getCategories = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return notImplemented('GET /categories');
};
