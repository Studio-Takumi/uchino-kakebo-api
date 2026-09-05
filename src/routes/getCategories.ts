import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error, json } from '../lib/response';
import { getSupabase, getUserId } from '../lib/supabase';

/**
 * GET /categories
 *
 * Return the user's categories ordered by priority asc, including the default
 * emoji, default method_id and is_income flag.
 */
export const getCategories = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { data, error: dbError } = await getSupabase()
    .from('categories')
    .select('category_id, category, color, priority, emoji, method_id, is_income')
    .eq('user_id', getUserId())
    .order('priority', { ascending: true });

  if (dbError) {
    console.error('GET /categories db error:', dbError);
    return error(500, 'INTERNAL_ERROR', 'Failed to fetch categories');
  }

  return json(200, data ?? []);
};
