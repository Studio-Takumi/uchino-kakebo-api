import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { notImplemented } from '../lib/response';

/**
 * POST /expenses
 *
 * Bulk-add expenses. Request body is a bare JSON array of NewExpenseInput.
 * Atomic: if any element is invalid, insert nothing and return 400 with
 * per-element details.
 *
 * Server-generated / injected per row (never taken from the client):
 *   - id                uuidv7()
 *   - user_id           getUserId()
 *   - created_time      now (ISO8601)
 *   - last_edited_time  now (ISO8601)
 *   (a client-supplied `id` is ignored.)
 *
 * Per-element validation:
 *   - expenses    integer >= 0
 *   - date        valid YYYY-MM-DD
 *   - title       non-empty string
 *   - method_id   exists for the user (see GET /methods set)
 *   - category_id exists for the user (see GET /categories set)
 *   - emoji       optional; if omitted, fill from the category's default emoji
 *   - comment     optional; defaults to ""
 *
 * TODO (implementation):
 *   - Parse & type-guard the array body (400 if not an array / empty).
 *   - Load the user's methods + categories once; validate ids against them.
 *   - Collect all errors first; if any, 400 VALIDATION_ERROR + details, no insert.
 *   - Otherwise build full Expense rows and insert the array in one call
 *     (single supabase .insert([...]) = all-or-nothing).
 *   - 201 with { inserted, items }.
 */
export const postExpenses = async (
  _event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
  return notImplemented('POST /expenses');
};
