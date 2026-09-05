import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { error, json } from '../lib/response';
import { getSupabase, getUserId } from '../lib/supabase';

/**
 * GET /methods
 *
 * Return the user's payment methods ordered by priority asc.
 */
export const getMethods = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  const { data, error: dbError } = await getSupabase()
    .from('methods')
    .select('method_id, method, color, priority')
    .eq('user_id', getUserId())
    .order('priority', { ascending: true });

  if (dbError) {
    console.error('GET /methods db error:', dbError);
    return error(500, 'INTERNAL_ERROR', 'Failed to fetch methods');
  }

  return json(200, data ?? []);
};
