import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { notImplemented } from '../lib/response';

/**
 * GET /methods
 *
 * Return the user's payment methods ordered by priority asc.
 *
 * TODO (implementation):
 *   - supabase.from('methods').select('method_id, method, color, priority')
 *       .eq('user_id', getUserId()).order('priority', { ascending: true })
 *   - 200 with the array, or 500 on db error.
 */
export const getMethods = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return notImplemented('GET /methods');
};
